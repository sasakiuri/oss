// SPDX-License-Identifier: MIT
import type { LaneInterruptionRecord } from '@/main/modules/competition-interruption/domain/LaneInterruptionRecord';
import type { Shot } from '@/main/modules/session/domain/Shot';

import type { CompetitionState } from '../domain/CompetitionState';
import { resolveCompetitionTargetMode } from '../domain/CompetitionTargetModePolicy';

import type { CompetitionStateDto } from './dto';

/** Projects the current series; prior positions never supply its observed mode. */
export function toCompetitionStateDto(
  state: CompetitionState,
  shots: readonly Shot[] = [],
  interruption: LaneInterruptionRecord | null = null,
): CompetitionStateDto {
  const stage = state.currentStageConfig;

  return {
    acc: state.config.acc,
    interruption: interruption
      ? {
          interruptionId: interruption.interruptionId,
          status: interruption.status,
          remainingSeconds: interruption.authorizedRemainingSeconds ?? interruption.capturedRemainingSeconds,
          unlimitedSightingShots: interruption.unlimitedSightingShots === true,
          restartHold: interruption.restartHold,
          remainingTimeVerified: interruption.remainingTimeVerified,
        }
      : null,
    id: state.id,
    sessionId: state.sessionId,
    phase: state.phase,
    currentStageIndex: state.currentStageIndex,
    currentSeriesIndex: state.currentSeriesIndex,
    seriesShotCount: state.seriesShotCount,
    timer: {
      remainingSeconds: state.timer.remainingSeconds,
      totalSeconds: state.timer.totalSeconds,
      formattedRemaining: state.timer.formattedRemaining,
      isExpired: state.timer.isExpired,
    },
    currentStageName: stage.name,
    scored: stage.scored,
    shotsPerSeries: state.config.shotsPerSeries,
    targetProfileId: stage.targetProfileId ?? state.config.targetProfileId,
    scoringGaugeProfileId: stage.scoringGaugeProfileId ?? state.config.scoringGaugeProfileId,
    athleteTargetControl: resolveCompetitionTargetMode(state, shots, interruption).athleteTargetControl,
  };
}
