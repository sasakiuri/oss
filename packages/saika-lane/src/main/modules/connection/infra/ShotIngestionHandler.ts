// SPDX-License-Identifier: MIT
/**
 * ShotIngestionHandler
 *
 * Handler factory for USB data reception → RecordShot command dispatch.
 * Verifies that an active session exists and guards shot acceptance in competition mode.
 */

import { RecordShotToken } from '@/main/composition/tokens';
import { resolveCompetitionShotMode } from '@/main/modules/competition/domain/CompetitionShotModePolicy';
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
import type { ITimedTargetControl, TimedTargetShotDecision } from '@/main/modules/timed-target';
import type { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import {
  isScoringGaugeProfileId,
  isTargetScoringProfileId,
  type ScoringGaugeProfileId,
  type TargetScoringProfileId,
} from '@/shared/target';

export interface ShotIngestionDeps {
  commandBus: CommandBus;
  sessionRepository: ISessionRepository;
  competitionRepository: ICompetitionRepository;
  shotObservationRepository: IShotObservationRepository;
  safetyStopReader?: Pick<ILaneSafetyStopControl, 'isStopped' | 'getState'>;
  shootOffReader?: Pick<ICompetitionShootOffControl, 'canAcceptShot' | 'getState'>;
  timedTargetReader?: Pick<ITimedTargetControl, 'tryAcceptShot'>;
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
    timedTargetReader,
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
      const shootOffCandidate =
        activeCompetition !== null && shootOffReader?.canAcceptShot(activeCompetition.id, shotData.timestamp) === true;
      const shootOffProgramId = shootOffCandidate ? shootOffReader?.getState()?.timedTargetProgramId : undefined;
      // A Final shoot-off remains an independent acquisition window. A RulePack
      // may add exact red/green target enforcement without putting these shots
      // into the current MATCH series.
      const timedTargetDecision =
        activeCompetition && (!shootOffCandidate || shootOffProgramId)
          ? assessTimedTargetShot(
              activeCompetition,
              observation.id,
              shotData.timestamp,
              timedTargetReader,
              shootOffProgramId,
            )
          : null;
      if (timedTargetDecision && !timedTargetDecision.allowed) {
        await finalizeObservation({
          observationId: observation.id,
          type: 'REJECTED_TIMED_TARGET_WINDOW',
          sessionId: activeCompetition!.sessionId,
          detail: timedTargetDecision.reason,
        });
        logger.warn('Shot rejected outside the timed target recording window', 'usb', {
          sequenceId: timedTargetDecision.sequenceId,
          reason: timedTargetDecision.reason,
        });
        return;
      }
      const acceptedByShootOff = shootOffCandidate && (!shootOffProgramId || timedTargetDecision?.allowed === true);
      if (
        activeCompetition &&
        !activeCompetition.canAcceptShot() &&
        !acceptedByShootOff &&
        !timedTargetDecision?.allowed
      ) {
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

      const effectiveMode = acceptedByShootOff
        ? Mode.sighting()
        : timedTargetDecision
          ? timedTargetDecision.purpose === 'SIGHTING'
            ? Mode.sighting()
            : Mode.match()
          : activeCompetition
            ? Mode.fromValue(
                resolveCompetitionShotMode(
                  activeCompetition.currentStageConfig,
                  activeCompetition.currentSeriesConfig,
                  shotData.mode,
                ),
              )
            : shotData.mode !== undefined
              ? Mode.fromValue(shotData.mode)
              : undefined;

      const targetProfileId = resolveTargetProfileId(activeCompetition, timedTargetDecision);
      const scoringGaugeProfileId = resolveScoringGaugeProfileId(activeCompetition);

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
        ...(targetProfileId ? { targetProfileId } : {}),
        ...(scoringGaugeProfileId ? { scoringGaugeProfileId } : {}),
      });

      await finalizeObservation({
        observationId: observation.id,
        type: 'RECORDED',
        sessionId: activeSession.id,
        ...(timedTargetDecision?.warning ? { detail: timedTargetDecision.warning } : {}),
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

function resolveScoringGaugeProfileId(
  competition: Awaited<ReturnType<ICompetitionRepository['findActive']>>,
): ScoringGaugeProfileId | undefined {
  const value = competition?.currentStageConfig.scoringGaugeProfileId ?? competition?.config.scoringGaugeProfileId;
  if (value === undefined) return undefined;
  if (!isScoringGaugeProfileId(value)) throw new Error(`Unknown scoring gauge profile: ${value}`);
  return value;
}

function assessTimedTargetShot(
  competition: NonNullable<Awaited<ReturnType<ICompetitionRepository['findActive']>>>,
  observationId: string,
  firedAt: Date,
  reader: ShotIngestionDeps['timedTargetReader'],
  expectedShootOffProgramId?: string,
): TimedTargetShotDecision | null {
  const expectedMatchProgramId = competition.currentSeriesConfig.timedTargetProgramId;
  if (!expectedMatchProgramId && !expectedShootOffProgramId) return null;
  const targetProfileId = competition.currentStageConfig.targetProfileId ?? competition.config.targetProfileId;
  if (!targetProfileId) throw new Error('Timed target stage has no target scoring profile');
  if (!reader) throw new Error('Timed target enforcement service is unavailable');
  return reader.tryAcceptShot({
    competitionId: competition.id,
    stageIndex: competition.currentStageIndex,
    seriesIndex: competition.currentSeriesIndex,
    ...(expectedMatchProgramId ? { expectedMatchProgramId } : {}),
    ...(competition.currentStageConfig.sightingTimedTargetProgramId
      ? { expectedSightingProgramId: competition.currentStageConfig.sightingTimedTargetProgramId }
      : {}),
    ...(expectedShootOffProgramId ? { expectedShootOffProgramId } : {}),
    targetProfileId,
    observationId,
    firedAt,
  });
}

function resolveTargetProfileId(
  competition: Awaited<ReturnType<ICompetitionRepository['findActive']>>,
  timedTargetDecision: TimedTargetShotDecision | null,
): TargetScoringProfileId | undefined {
  const value =
    timedTargetDecision?.targetProfileId ??
    competition?.currentStageConfig.targetProfileId ??
    competition?.config.targetProfileId;
  if (value === undefined) return undefined;
  if (!isTargetScoringProfileId(value)) throw new Error(`Unknown target scoring profile: ${value}`);
  return value;
}
