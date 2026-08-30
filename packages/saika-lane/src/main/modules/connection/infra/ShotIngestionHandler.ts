// SPDX-License-Identifier: MIT
/**
 * ShotIngestionHandler
 *
 * Handler factory for USB data reception → RecordShot command dispatch.
 * Verifies that an active session exists and guards shot acceptance in competition mode.
 */

import { RecordShotToken } from '@/main/composition/tokens';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { ICompetitionShootOffControl } from '@/main/modules/competition-shoot-off';
import type { ShotData } from '@/main/modules/connection/infra/usb/IUSBConnectionManager';
import type { ILaneSafetyStopControl } from '@/main/modules/safety-stop';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import { Mode } from '@/main/modules/session/domain/Mode';
import type { IShotObservationRepository } from '@/main/modules/shot-observation/domain/IShotObservationRepository';
import { ShotObservation, createShotObservationOutcome } from '@/main/modules/shot-observation/domain/ShotObservation';
import {
  createShotObservationEvidence,
  type ShotObservationCompetitionContext,
} from '@/main/modules/shot-observation/domain/ShotObservationEvidence';
import type { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';

export interface ShotIngestionDeps {
  commandBus: CommandBus;
  sessionRepository: ISessionRepository;
  competitionRepository: ICompetitionRepository;
  shotObservationRepository: IShotObservationRepository;
  safetyStopReader?: Pick<ILaneSafetyStopControl, 'isStopped' | 'getState'>;
  shootOffReader?: Pick<ICompetitionShootOffControl, 'canAcceptShot'>;
  onObservationFinalized?: (evidenceId: string) => void;
}

export function createShotIngestionHandler(deps: ShotIngestionDeps): (shotData: ShotData) => Promise<void> {
  const {
    commandBus,
    sessionRepository,
    competitionRepository,
    shotObservationRepository,
    safetyStopReader,
    shootOffReader,
    onObservationFinalized,
  } = deps;

  const ingestShot = async (shotData: ShotData): Promise<void> => {
    const logger = getLogger();
    const observation = ShotObservation.create({
      x: shotData.x,
      y: shotData.y,
      deviceScoreX10: shotData.score,
      firedAt: shotData.timestamp,
      receivedAt: new Date(),
      reportedMode: shotData.mode,
      rawFrameHex: shotData.raw?.toString('hex'),
    });
    let observationAppended = false;
    let competitionContext: ShotObservationCompetitionContext | null = null;
    const finalizeObservation = async (props: Parameters<typeof createShotObservationOutcome>[0]): Promise<void> => {
      const outcome = createShotObservationOutcome(props);
      const evidence = createShotObservationEvidence(observation, outcome, competitionContext);
      await shotObservationRepository.appendOutcomeWithEvidence(outcome, evidence);
      try {
        onObservationFinalized?.(evidence.evidenceId);
      } catch (notificationError) {
        logger.warn('Shot observation evidence notification failed', 'usb', {
          error: notificationError instanceof Error ? notificationError.message : String(notificationError),
        });
      }
    };
    try {
      // Capture target evidence before applying session or competition guards.
      await shotObservationRepository.append(observation);
      observationAppended = true;

      // In competition mode, the competition state is the source of truth for
      // the current session. Falling back to findActive() can select an older
      // unfinished session if stale rows exist in the local DB.
      const activeCompetition = await competitionRepository.findActive();
      competitionContext = activeCompetition
        ? {
            competitionId: activeCompetition.id,
            phase: activeCompetition.phase,
            stageIndex: activeCompetition.currentStageIndex,
            seriesIndex: activeCompetition.currentSeriesIndex,
            stageScored: activeCompetition.currentStageConfig.scored,
          }
        : null;
      if (safetyStopReader?.isStopped()) {
        const safetyStopId = safetyStopReader.getState()?.safetyStopId ?? 'unknown';
        await finalizeObservation({
          observationId: observation.id,
          type: 'QUARANTINED_SAFETY_STOP',
          ...(activeCompetition ? { sessionId: activeCompetition.sessionId } : {}),
          detail: `safetyStopId=${safetyStopId}`,
        });
        logger.warn('Shot quarantined while Lane safety stop is active', 'usb', { safetyStopId });
        return;
      }
      const acceptedByShootOff =
        activeCompetition !== null && shootOffReader?.canAcceptShot(activeCompetition.id, shotData.timestamp) === true;
      if (activeCompetition && !activeCompetition.canAcceptShot() && !acceptedByShootOff) {
        await finalizeObservation({
          observationId: observation.id,
          type: 'REJECTED_COMPETITION_PHASE',
          sessionId: activeCompetition.sessionId,
          detail: `phase=${activeCompetition.phase}`,
        });
        logger.debug('Shot rejected by competition guard', 'usb', {
          phase: activeCompetition.phase,
        });
        return;
      }

      const activeSession = activeCompetition?.sessionId
        ? await sessionRepository.findById(activeCompetition.sessionId)
        : await sessionRepository.findActive();

      if (!activeSession) {
        await finalizeObservation({ observationId: observation.id, type: 'NO_ACTIVE_SESSION' });
        logger.warn('No active session for shot data', 'usb');
        return;
      }

      const stageScored = activeCompetition?.currentStageConfig?.scored;
      const effectiveMode = acceptedByShootOff
        ? Mode.sighting()
        : typeof stageScored === 'boolean'
          ? stageScored
            ? Mode.match()
            : Mode.sighting()
          : shotData.mode !== undefined
            ? Mode.fromValue(shotData.mode)
            : undefined;

      await commandBus.execute(RecordShotToken, {
        sessionId: activeSession.id,
        impactPoint: shotData.x !== null && shotData.y !== null ? new ImpactPoint(shotData.x, shotData.y) : null,
        timestamp: shotData.timestamp,
        receivedAt: observation.receivedAt,
        deviceScore: shotData.score,
        sourceObservationId: observation.id,
        // A persisted competition stage is authoritative. Adapter context can
        // be stale immediately after restarting the app during MATCH.
        mode: effectiveMode,
      });

      await finalizeObservation({
        observationId: observation.id,
        type: 'RECORDED',
        sessionId: activeSession.id,
      });

      logger.debug('Shot recorded via USB', 'usb', {
        sessionId: activeSession.id,
        x: shotData.x,
        y: shotData.y,
      });
    } catch (error) {
      if (observationAppended) {
        try {
          await finalizeObservation({
            observationId: observation.id,
            type: 'PROCESSING_FAILED',
            detail: error instanceof Error ? error.message : String(error),
          });
        } catch (outcomeError) {
          logger.error(
            'Failed to record shot observation outcome',
            'usb',
            outcomeError instanceof Error ? { error: outcomeError.stack } : { error: String(outcomeError) },
          );
        }
      }
      logger.error(
        'Failed to record shot',
        'usb',
        error instanceof Error ? { error: error.stack } : { error: String(error) },
      );
    }
  };

  // A protocol session can emit multiple complete frames from one serial chunk.
  // Keep repository read-modify-write operations in receipt order so concurrent
  // callbacks cannot reconstruct the same session state and reuse a shot number.
  let ingestionQueue = Promise.resolve();
  return (shotData: ShotData): Promise<void> => {
    const result = ingestionQueue.then(() => ingestShot(shotData));
    ingestionQueue = result.catch(() => undefined);
    return result;
  };
}
