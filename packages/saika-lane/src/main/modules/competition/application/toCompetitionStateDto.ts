// SPDX-License-Identifier: MIT
import type { Shot } from '@/main/modules/session/domain/Shot';

import { resolveCompetitionShotMode } from '../domain/CompetitionShotModePolicy';
import type { CompetitionState } from '../domain/CompetitionState';

import type { CompetitionStateDto } from './dto';

/** Projects the current series; prior positions never supply its observed mode. */
export function toCompetitionStateDto(state: CompetitionState, shots: readonly Shot[] = []): CompetitionStateDto {
  const stage = state.currentStageConfig;
  const series = state.currentSeriesConfig;
  const observed = [...shots].reverse().find((shot) => {
    const context = shot.competitionContext;
    return (
      context?.competitionId === state.id &&
      context.stageIndex === state.currentStageIndex &&
      context.seriesIndex === state.currentSeriesIndex
    );
  });
  const resolve = (mode: 'SIGHTING' | 'MATCH' | undefined, selection = state.athleteTargetMode) =>
    resolveCompetitionShotMode(stage, series, mode, state.seriesShotCount, selection);
  return {
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
    athleteTargetControl:
      state.phase === 'ACTIVE' && series.targetModeControl === 'ATHLETE'
        ? {
            sightingAllowed: resolve('SIGHTING', 'SIGHTING') === 'SIGHTING',
            matchAllowed: resolve('MATCH', 'MATCH') === 'MATCH',
            selected: state.athleteTargetMode ?? null,
            effective: resolve(observed?.mode.value),
          }
        : null,
  };
}
