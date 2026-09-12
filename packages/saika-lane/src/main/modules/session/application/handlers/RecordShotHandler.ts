// SPDX-License-Identifier: MIT
import type { RecordShotInput } from '@/main/composition/tokens';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import { Score } from '@/main/modules/session/domain/Score';
import { ScoreCalculationService } from '@/main/modules/session/domain/ScoreCalculationService';
import type { ScoreDiscrepancyDetector } from '@/main/modules/session/domain/ScoreDiscrepancyDetector';
import type { CommandHandler } from '@/main/shared-infra/cqrs';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import { DEFAULT_TARGET_SCORING_PROFILE_BY_DISCIPLINE, getTargetScoringProfile } from '@/shared/target';

export function createRecordShotHandler(
  sessionRepository: ISessionRepository,
  scoreService: ScoreCalculationService,
  eventBus: IEventBus,
  discrepancyDetector: ScoreDiscrepancyDetector,
): CommandHandler<RecordShotInput> {
  return async (input) => {
    // Retrieve the session
    const session = await sessionRepository.findById(input.sessionId);
    if (!session) {
      throw ErrorCatalog.createError('SESSION_NOT_FOUND');
    }

    const targetProfileId =
      input.targetProfileId ?? DEFAULT_TARGET_SCORING_PROFILE_BY_DISCIPLINE[session.discipline.value];
    const scoringGaugeProfileId =
      input.scoringGaugeProfileId ?? getTargetScoringProfile(targetProfileId).defaultScoringGaugeProfileId;

    // For a miss shot (impactPoint: null), skip score calculation and use 0 points
    const calculatedScore =
      input.impactPoint !== null
        ? scoreService.calculateScore(input.impactPoint, session.discipline, targetProfileId, scoringGaugeProfileId)
        : Score.miss();

    // Detect discrepancy between device score and app-calculated score (non-miss shots only)
    if (input.deviceScore !== undefined && input.impactPoint !== null) {
      discrepancyDetector.detect({
        deviceScore: input.deviceScore,
        calculatedScore,
        impactPoint: input.impactPoint,
        timestamp: input.timestamp,
        sessionId: input.sessionId,
        discipline: session.discipline.value,
        mode: session.mode.value,
      });
    }

    // Prioritize the device-reported score (×10 integer); fall back to the recalculated score if unavailable
    const rawScore = input.deviceScore !== undefined ? new Score(input.deviceScore) : calculatedScore;

    // In RING mode, floor the score (truncate ×10 integer to nearest multiple of 10: 105→100); leave as-is in DECIMAL
    const finalScore = session.scoringMode === 'RING' ? new Score(Math.floor(rawScore.value / 10) * 10) : rawScore;

    // Preserve the device-reported score (×10 integer); undefined if unavailable
    const deviceScore = input.deviceScore !== undefined ? new Score(input.deviceScore) : undefined;

    // X ring determination (physical geometry)
    const innerTen = scoreService.isInnerTen(
      input.impactPoint,
      session.discipline,
      targetProfileId,
      scoringGaugeProfileId,
    );

    const updatedSession = session.recordShot(
      input.impactPoint,
      finalScore,
      input.timestamp,
      deviceScore,
      innerTen,
      input.mode, // Use the mode captured for this shot (falls back to the session mode if omitted)
      {
        calculatedScore,
        receivedAt: input.receivedAt ?? new Date(),
        sourceObservationId: input.sourceObservationId,
        competitionContext: input.competitionContext,
        targetProfileId,
        scoringGaugeProfileId,
      },
    );

    // Retrieve the recorded shot (the last shot)
    const recordedShot = updatedSession.allShots[updatedSession.allShots.length - 1];

    // Independent workflows persist their evidence through their own durable
    // journal/outbox. Keeping the shot out of the normal Session is what makes
    // later official adjudication explicit instead of silently changing score.
    if (!recordedShot) {
      throw ErrorCatalog.createError('INVALID_SESSION_STATE', {
        detail: 'No shot exists after recordShot',
      });
    }
    if (input.acquisitionContext?.shotDisposition !== 'ISOLATED') {
      await sessionRepository.saveShot(updatedSession, recordedShot);
    }

    // Emit ShotRecorded event
    eventBus.emit({
      type: 'ShotRecorded',
      timestamp: Date.now(),
      aggregateId: updatedSession.id,
      shot: recordedShot,
      scoringMode: session.scoringMode,
      rawScore: session.scoringMode === 'RING' && rawScore.value !== finalScore.value ? rawScore.value : undefined,
      ...(input.acquisitionContext ? { acquisitionContext: Object.freeze({ ...input.acquisitionContext }) } : {}),
    });
  };
}
