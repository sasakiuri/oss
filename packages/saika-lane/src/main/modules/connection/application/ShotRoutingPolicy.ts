// SPDX-License-Identifier: MIT
/**
 * Pure routing decisions for a received target shot. ShotRoutingService reads
 * the facts in order and applies the outcome.
 */

import {
  isAthleteTargetSwitchSeries,
  previousPositionLabel,
  resolveCompetitionShotMode,
  type ReportedShotMode,
} from '@/main/modules/competition/domain/CompetitionShotModePolicy';
import type { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { resolveCompetitionTargetMode } from '@/main/modules/competition/domain/CompetitionTargetModePolicy';
import type { LaneInterruptionRecord } from '@/main/modules/competition-interruption/domain/LaneInterruptionRecord';
import { Mode } from '@/main/modules/session/domain/Mode';
import type { Shot } from '@/main/modules/session/domain/Shot';
import type { ITimedTargetControl, TimedTargetShotDecision } from '@/main/modules/timed-target';
import {
  isScoringGaugeProfileId,
  isTargetScoringProfileId,
  type ScoringGaugeProfileId,
  type TargetScoringProfileId,
} from '@/shared/target';
import type { ShotTimestampSource } from '@/shared/types/ShotTimestampSource';

/** The independent Final shoot-off acquisition window as read for one shot. */
export interface ShootOffWindow {
  /** The shot falls inside the window. */
  readonly open: boolean;
  /** The timed-target program the open window requires, if any. */
  readonly timedTargetProgramId?: string;
}

export const CLOSED_SHOOT_OFF_WINDOW: ShootOffWindow = { open: false };

export type TimedTargetShotRequest = Parameters<ITimedTargetControl['tryAcceptShot']>[0];

export type ShotRejectionType =
  | 'QUARANTINED_SAFETY_STOP'
  | 'QUARANTINED_TIMING_REVIEW'
  | 'REJECTED_TIMED_TARGET_WINDOW'
  | 'REJECTED_COMPETITION_PHASE';

export type ShotAdmission =
  | { readonly admitted: true; readonly acceptedByShootOff: boolean }
  | {
      readonly admitted: false;
      readonly type: ShotRejectionType;
      readonly sessionId?: string;
      readonly detail: string;
    };

export type ShotRecording =
  | { readonly nullify: true; readonly detail: string }
  | { readonly nullify: false; readonly mode: Mode | undefined; readonly athleteModeObserved: boolean };

/**
 * The timed-target check a shot needs, or null when no timed-target program
 * governs it. A Final shoot-off window without a program stays outside the
 * MATCH timed-target guard.
 *
 * @throws when a governed stage has no target scoring profile
 */
export function timedTargetShotRequest(
  competition: CompetitionState | null,
  shootOff: ShootOffWindow,
  shot: { observationId: string; firedAt: Date; timestampSource?: ShotTimestampSource },
): TimedTargetShotRequest | null {
  if (!competition || (shootOff.open && !shootOff.timedTargetProgramId)) return null;
  const expectedShootOffProgramId = shootOff.open ? shootOff.timedTargetProgramId : undefined;
  const expectedMatchProgramId = competition.currentSeriesConfig.timedTargetProgramId;
  if (!expectedMatchProgramId && !expectedShootOffProgramId) return null;
  const targetProfileId = competition.effectiveTargetProfileId;
  if (!targetProfileId) throw new Error('Timed target stage has no target scoring profile');
  return {
    competitionId: competition.id,
    stageIndex: competition.currentStageIndex,
    seriesIndex: competition.currentSeriesIndex,
    ...(expectedMatchProgramId ? { expectedMatchProgramId } : {}),
    ...(competition.currentStageConfig.sightingTimedTargetProgramId
      ? { expectedSightingProgramId: competition.currentStageConfig.sightingTimedTargetProgramId }
      : {}),
    ...(expectedShootOffProgramId ? { expectedShootOffProgramId } : {}),
    targetProfileId,
    observationId: shot.observationId,
    firedAt: shot.firedAt,
    timestampSource: shot.timestampSource,
  };
}

/**
 * Decides whether a shot may enter a session: a safety stop quarantines it, a
 * timed-target decision may reject or hold it, and a competition outside an
 * accepting phase rejects it unless a shoot-off or timed-target window accepted it.
 */
export function decideShotAdmission(facts: {
  competition: CompetitionState | null;
  /** Set while the Lane safety latch is stopped. */
  safetyStopId: string | null;
  shootOff: ShootOffWindow;
  timedTarget: TimedTargetShotDecision | null;
}): ShotAdmission {
  const { competition, safetyStopId, shootOff, timedTarget } = facts;
  if (safetyStopId !== null) {
    return {
      admitted: false,
      type: 'QUARANTINED_SAFETY_STOP',
      ...(competition ? { sessionId: competition.sessionId } : {}),
      detail: `safetyStopId=${safetyStopId}`,
    };
  }
  if (timedTarget && !timedTarget.allowed) {
    return {
      admitted: false,
      type: timedTarget.timingReviewRequired ? 'QUARANTINED_TIMING_REVIEW' : 'REJECTED_TIMED_TARGET_WINDOW',
      sessionId: competition!.sessionId,
      detail: timedTarget.reason,
    };
  }
  const acceptedByShootOff = shootOff.open && (!shootOff.timedTargetProgramId || timedTarget?.allowed === true);
  if (competition && !competition.canAcceptShot() && !acceptedByShootOff && !timedTarget?.allowed) {
    return {
      admitted: false,
      type: 'REJECTED_COMPETITION_PHASE',
      sessionId: competition.sessionId,
      detail: `phase=${competition.phase}`,
    };
  }
  return { admitted: true, acceptedByShootOff };
}

/**
 * Decides the stored mode of an admitted shot, or that it is an extra fired
 * on Match before the required Sighting of a new position. A persisted
 * competition stage is authoritative over the mode the target reports.
 */
export function decideShotRecording(facts: {
  competition: CompetitionState | null;
  sessionShots: readonly Shot[];
  interruption: LaneInterruptionRecord | null;
  acceptedByShootOff: boolean;
  timedTarget: TimedTargetShotDecision | null;
  reportedMode: ReportedShotMode | undefined;
}): ShotRecording {
  const { competition, timedTarget, reportedMode } = facts;
  const targetMode = competition
    ? resolveCompetitionTargetMode(competition, facts.sessionShots, facts.interruption)
    : null;
  if (facts.acceptedByShootOff || targetMode?.officialSighting === true) {
    return { nullify: false, mode: Mode.sighting(), athleteModeObserved: false };
  }
  if (timedTarget) {
    const sighting = timedTarget.executionContext?.shotDisposition === 'ISOLATED' || timedTarget.purpose === 'SIGHTING';
    return { nullify: false, mode: sighting ? Mode.sighting() : Mode.match(), athleteModeObserved: false };
  }
  if (competition) {
    const decision = resolveCompetitionShotMode(
      competition.currentStageConfig,
      competition.currentSeriesConfig,
      reportedMode,
      competition.seriesShotCount,
      competition.athleteTargetMode,
      targetMode!.sightingRequired,
    );
    if (decision.nullify) {
      return {
        nullify: true,
        detail: `Nullified extra — ${previousPositionLabel(competition.currentStageConfig, competition.currentSeriesIndex)} · ISSF 6.10.4(c) / 7.7.3`,
      };
    }
    return {
      nullify: false,
      mode: Mode.fromValue(decision.mode),
      athleteModeObserved: isAthleteTargetSwitchSeries(competition.currentStageConfig, competition.currentSeriesConfig),
    };
  }
  return {
    nullify: false,
    mode: reportedMode !== undefined ? Mode.fromValue(reportedMode) : undefined,
    athleteModeObserved: false,
  };
}

/**
 * The target face and scoring gauge a recorded shot is scored with: a
 * timed-target window's face first, then the competition stage or round.
 *
 * @throws for a profile id this Lane does not know
 */
export function resolveShotProfiles(
  competition: CompetitionState | null,
  timedTarget: TimedTargetShotDecision | null,
): { targetProfileId?: TargetScoringProfileId; scoringGaugeProfileId?: ScoringGaugeProfileId } {
  const targetProfileId = timedTarget?.targetProfileId ?? competition?.effectiveTargetProfileId;
  if (targetProfileId !== undefined && !isTargetScoringProfileId(targetProfileId)) {
    throw new Error(`Unknown target scoring profile: ${targetProfileId}`);
  }
  const scoringGaugeProfileId = competition?.effectiveScoringGaugeProfileId;
  if (scoringGaugeProfileId !== undefined && !isScoringGaugeProfileId(scoringGaugeProfileId)) {
    throw new Error(`Unknown scoring gauge profile: ${scoringGaugeProfileId}`);
  }
  return {
    ...(targetProfileId ? { targetProfileId } : {}),
    ...(scoringGaugeProfileId ? { scoringGaugeProfileId } : {}),
  };
}
