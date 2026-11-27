// SPDX-License-Identifier: MIT
import { RecordShotToken } from '@/main/composition/tokens';
import type { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { ICompetitionInterruptionControl } from '@/main/modules/competition-interruption';
import type { ICompetitionShootOffControl } from '@/main/modules/competition-shoot-off';
import type { ShotData } from '@/main/modules/connection/domain/ShotData';
import type { ILaneSafetyStopControl } from '@/main/modules/safety-stop';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import { Mode } from '@/main/modules/session/domain/Mode';
import type { Session } from '@/main/modules/session/domain/Session';
import type { IShotObservationRepository } from '@/main/modules/shot-observation/domain/IShotObservationRepository';
import { ShotObservation, createShotObservationOutcome } from '@/main/modules/shot-observation/domain/ShotObservation';
import {
  createShotObservationEvidence,
  type ShotObservationCompetitionContext,
} from '@/main/modules/shot-observation/domain/ShotObservationEvidence';
import type { ITimedTargetControl, TimedTargetShotDecision } from '@/main/modules/timed-target';
import type { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { errorMessage } from '@/shared/errors/errorMessage';

import {
  CLOSED_SHOOT_OFF_WINDOW,
  decideShotAdmission,
  decideShotRecording,
  resolveShotProfiles,
  timedTargetShotRequest,
  type ShootOffWindow,
} from './ShotRoutingPolicy';

export interface ShotRoutingDeps {
  commandBus: CommandBus;
  sessionRepository: ISessionRepository;
  competitionRepository: ICompetitionRepository;
  shotObservationRepository: IShotObservationRepository;
  eventBus: IEventBus;
  interruptionReader?: Pick<ICompetitionInterruptionControl, 'get'>;
  safetyStopReader?: Pick<ILaneSafetyStopControl, 'isStopped' | 'getState'>;
  shootOffReader?: Pick<ICompetitionShootOffControl, 'canAcceptShot' | 'getState'>;
  timedTargetReader?: Pick<ITimedTargetControl, 'tryAcceptShot'>;
  onObservationFinalized?: (evidenceId: string) => void;
}

type OutcomeProps = Parameters<typeof createShotObservationOutcome>[0];

/**
 * Journals each received target shot, then records it into the competition's
 * session or finalizes it as quarantined, rejected or nullified evidence.
 * Callers serialize calls; each one reads and writes the session and competition.
 */
export class ShotRoutingService {
  constructor(private readonly deps: ShotRoutingDeps) {}

  async route(shotData: ShotData): Promise<void> {
    const logger = getLogger();
    const { commandBus, sessionRepository, competitionRepository, shotObservationRepository } = this.deps;
    const observation = ShotObservation.create({
      x: shotData.x,
      y: shotData.y,
      deviceScoreX10: shotData.score,
      firedAt: shotData.timestamp,
      timestampSource: shotData.timestampSource ?? 'LANE_RECEIPT',
      receivedAt: new Date(),
      reportedMode: shotData.mode,
      rawFrameHex: shotData.raw?.toString('hex'),
    });
    let observationAppended = false;
    let outcomeFinalized = false;
    let competitionContext: ShotObservationCompetitionContext | null = null;
    const finalizeObservation = async (props: OutcomeProps): Promise<void> => {
      const outcome = createShotObservationOutcome(props);
      const evidence = createShotObservationEvidence(observation, outcome, competitionContext);
      await shotObservationRepository.appendOutcomeWithEvidence(outcome, evidence);
      outcomeFinalized = true;
      try {
        this.deps.onObservationFinalized?.(evidence.evidenceId);
      } catch (notificationError) {
        logger.warn('Shot observation evidence notification failed', 'usb', {
          error: errorMessage(notificationError),
        });
      }
    };
    try {
      // Capture target evidence before applying session or competition guards.
      await shotObservationRepository.append(observation);
      observationAppended = true;

      // Use the competition's session; findActive() can select an older
      // unfinished session left in the local DB.
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

      // A safety stop skips every other gate.
      const safetyStopId = this.readSafetyStopId();
      const shootOff =
        safetyStopId === null && activeCompetition
          ? this.readShootOffWindow(activeCompetition.id, shotData.timestamp)
          : CLOSED_SHOOT_OFF_WINDOW;
      // A Final shoot-off remains an independent acquisition window. A RulePack
      // may add exact red/green target enforcement without putting these shots
      // into the current MATCH series.
      const timedTargetDecision =
        safetyStopId === null
          ? this.assessTimedTargetShot(
              timedTargetShotRequest(activeCompetition, shootOff, {
                observationId: observation.id,
                firedAt: shotData.timestamp,
                timestampSource: observation.timestampSource,
              }),
            )
          : null;
      const admission = decideShotAdmission({
        competition: activeCompetition,
        safetyStopId,
        shootOff,
        timedTarget: timedTargetDecision,
      });
      if (!admission.admitted) {
        await finalizeObservation({
          observationId: observation.id,
          type: admission.type,
          ...(admission.sessionId === undefined ? {} : { sessionId: admission.sessionId }),
          detail: admission.detail,
        });
        if (admission.type === 'QUARANTINED_SAFETY_STOP') {
          logger.warn('Shot quarantined while Lane safety stop is active', 'usb', { safetyStopId });
        } else if (admission.type === 'REJECTED_COMPETITION_PHASE') {
          logger.debug('Shot rejected by competition guard', 'usb', { phase: activeCompetition!.phase });
        } else {
          logger.warn(
            admission.type === 'QUARANTINED_TIMING_REVIEW'
              ? 'Shot held for timing review'
              : 'Shot rejected outside the timed target recording window',
            'usb',
            { sequenceId: timedTargetDecision!.sequenceId, reason: timedTargetDecision!.reason },
          );
        }
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

      const recording = decideShotRecording({
        competition: activeCompetition,
        sessionShots: activeSession.allShots,
        interruption: activeCompetition ? (this.deps.interruptionReader?.get(activeCompetition.id) ?? null) : null,
        acceptedByShootOff: admission.acceptedByShootOff,
        timedTarget: timedTargetDecision,
        reportedMode: shotData.mode,
      });
      if (recording.nullify) {
        await finalizeObservation({
          observationId: observation.id,
          type: 'NULLIFIED_POSITION_EXTRA',
          sessionId: activeSession.id,
          detail: recording.detail,
        });
        await this.resetSightingAfterNullifiedExtra(activeCompetition!, activeSession);
        return;
      }

      const profiles = resolveShotProfiles(activeCompetition, timedTargetDecision);

      await commandBus.execute(RecordShotToken, {
        sessionId: activeSession.id,
        impactPoint: shotData.x !== null && shotData.y !== null ? new ImpactPoint(shotData.x, shotData.y) : null,
        timestamp: shotData.timestamp,
        receivedAt: observation.receivedAt,
        deviceScore: shotData.score,
        reportedMode: shotData.mode,
        sourceObservationId: observation.id,
        ...(activeCompetition
          ? {
              competitionContext: {
                competitionId: activeCompetition.id,
                stageIndex: activeCompetition.currentStageIndex,
                seriesIndex: activeCompetition.currentSeriesIndex,
                ...(recording.athleteModeObserved ? { athleteModeObserved: true as const } : {}),
              },
            }
          : {}),
        // A persisted competition stage is authoritative. Adapter context can
        // be stale immediately after restarting the app during MATCH.
        mode: recording.mode,
        ...profiles,
        ...(timedTargetDecision?.executionContext ? { acquisitionContext: timedTargetDecision.executionContext } : {}),
      });

      await finalizeObservation({
        observationId: observation.id,
        type: 'RECORDED',
        sessionId: activeSession.id,
        ...(timedTargetDecision?.warning || timedTargetDecision?.timingEvidence
          ? { detail: timedTargetDecision.warning ?? timedTargetDecision.timingEvidence }
          : {}),
      });

      logger.debug('Shot recorded via USB', 'usb', {
        sessionId: activeSession.id,
        x: shotData.x,
        y: shotData.y,
      });
    } catch (error) {
      if (observationAppended && !outcomeFinalized) {
        try {
          await finalizeObservation({
            observationId: observation.id,
            type: 'PROCESSING_FAILED',
            detail: errorMessage(error),
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
  }

  /** The active safety stop id ('unknown' without state), or null while not stopped. */
  private readSafetyStopId(): string | null {
    const reader = this.deps.safetyStopReader;
    if (!reader?.isStopped()) return null;
    return reader.getState()?.safetyStopId ?? 'unknown';
  }

  private readShootOffWindow(competitionId: string, firedAt: Date): ShootOffWindow {
    const reader = this.deps.shootOffReader;
    if (reader?.canAcceptShot(competitionId, firedAt) !== true) return CLOSED_SHOOT_OFF_WINDOW;
    const timedTargetProgramId = reader.getState()?.timedTargetProgramId;
    return timedTargetProgramId === undefined ? { open: true } : { open: true, timedTargetProgramId };
  }

  private assessTimedTargetShot(request: ReturnType<typeof timedTargetShotRequest>): TimedTargetShotDecision | null {
    if (!request) return null;
    const reader = this.deps.timedTargetReader;
    if (!reader) throw new Error('Timed target enforcement service is unavailable');
    return reader.tryAcceptShot(request);
  }

  /** The extra is already final; a reset failure must not create another routing outcome. */
  private async resetSightingAfterNullifiedExtra(competition: CompetitionState, session: Session): Promise<void> {
    const { competitionRepository, eventBus } = this.deps;
    try {
      // Re-read after the journal write; a reset must never overwrite a newer clock or series.
      const current = await competitionRepository.findById(competition.id);
      if (!current) throw new Error('Competition disappeared before the Sighting reset');
      const reset = current.resetAthleteTargetToSighting({
        competitionId: competition.id,
        stageIndex: competition.currentStageIndex,
        seriesIndex: competition.currentSeriesIndex,
      });
      await competitionRepository.save(reset);
      eventBus.emit({
        type: 'AthleteTargetModeChanged',
        aggregateId: reset.id,
        timestamp: Date.now(),
        newMode: Mode.sighting(),
      });
      eventBus.emit({
        type: 'PositionExtraNullified',
        aggregateId: session.id,
        timestamp: Date.now(),
        competitionId: reset.id,
      });
    } catch (error) {
      getLogger().error('Failed to reset Sighting after nullifying an extra', 'usb', {
        error: errorMessage(error),
      });
      eventBus.emit({
        type: 'PositionExtraNullified',
        aggregateId: session.id,
        timestamp: Date.now(),
        competitionId: competition.id,
        resetError: 'Extra shot nullified. The Sighting reset failed. Contact a Range Officer.',
      });
    }
  }
}
