// SPDX-License-Identifier: MIT
import type { LaneInterruptionRecord } from '@/main/modules/competition-interruption/domain/LaneInterruptionRecord';
import type { Shot } from '@/main/modules/session/domain/Shot';

import { resolveCompetitionShotMode, type ReportedShotMode } from './CompetitionShotModePolicy';
import type { CompetitionState } from './CompetitionState';

export interface CompetitionTargetMode {
  effective: ReportedShotMode;
  officialSighting: boolean;
  athleteTargetControl: {
    sightingAllowed: boolean;
    matchAllowed: boolean;
    selected: ReportedShotMode | null;
    effective: ReportedShotMode;
  } | null;
}

/** One target-mode policy for device restoration/sends and Lane/Vista presentation. */
export function resolveCompetitionTargetMode(
  state: CompetitionState,
  shots: readonly Shot[],
  interruption: LaneInterruptionRecord | null,
): CompetitionTargetMode {
  const stage = state.currentStageConfig;
  const series = state.currentSeriesConfig;
  const officialSighting =
    state.phase === 'ACTIVE' &&
    interruption?.competitionId === state.id &&
    (interruption.status === 'SIGHTING' ||
      (interruption.status === 'RESUME_PENDING' && interruption.unlimitedSightingShots === true));
  const observed = [...shots].reverse().find((shot) => {
    const context = shot.competitionContext;
    return (
      context?.athleteModeObserved === true &&
      context.competitionId === state.id &&
      context.stageIndex === state.currentStageIndex &&
      context.seriesIndex === state.currentSeriesIndex
    );
  });
  const effective = officialSighting
    ? 'SIGHTING'
    : resolveCompetitionShotMode(stage, series, observed?.mode.value, state.seriesShotCount, state.athleteTargetMode);
  return {
    effective,
    officialSighting,
    athleteTargetControl:
      state.phase === 'ACTIVE' && series.targetModeControl === 'ATHLETE'
        ? {
            sightingAllowed:
              !officialSighting &&
              resolveCompetitionShotMode(stage, series, 'SIGHTING', state.seriesShotCount, 'SIGHTING') === 'SIGHTING',
            matchAllowed:
              !officialSighting &&
              resolveCompetitionShotMode(stage, series, 'MATCH', state.seriesShotCount, 'MATCH') === 'MATCH',
            selected: state.athleteTargetMode ?? null,
            effective,
          }
        : null,
  };
}
