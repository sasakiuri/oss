// SPDX-License-Identifier: MIT
import type { LaneInterruptionRecord } from '@/main/modules/competition-interruption/domain/LaneInterruptionRecord';
import type { Shot } from '@/main/modules/session/domain/Shot';

import { resolveCompetitionShotMode, type ReportedShotMode } from './CompetitionShotModePolicy';
import type { CompetitionState } from './CompetitionState';

export interface CompetitionTargetMode {
  effective: ReportedShotMode;
  officialSighting: boolean;
  sightingRequired: boolean;
  athleteTargetControl: {
    officialSighting: boolean;
    sightingAllowed: boolean;
    matchAllowed: boolean;
    matchUnavailableReason: 'SIGHTING_REQUIRED' | null;
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
  const observations = shots.filter((shot) => {
    const context = shot.competitionContext;
    return (
      context?.athleteModeObserved === true &&
      context.competitionId === state.id &&
      context.stageIndex === state.currentStageIndex &&
      context.seriesIndex === state.currentSeriesIndex
    );
  });
  const observed = observations.at(-1);
  const sightingRequired =
    state.phase === 'ACTIVE' &&
    stage.scored &&
    series.targetModeControl === 'ATHLETE' &&
    series.purpose !== 'POSITION_CHANGE_AND_SIGHTING' &&
    state.seriesShotCount === 0 &&
    !officialSighting &&
    state.athleteTargetMode == null &&
    !observations.some((shot) => shot.mode.isSighting());
  const effective = officialSighting
    ? 'SIGHTING'
    : resolveCompetitionShotMode(
        stage,
        series,
        observed?.mode.value,
        state.seriesShotCount,
        state.athleteTargetMode,
        sightingRequired,
      ).mode;
  return {
    effective,
    officialSighting,
    sightingRequired,
    athleteTargetControl:
      state.phase === 'ACTIVE' && series.targetModeControl === 'ATHLETE'
        ? {
            officialSighting,
            sightingAllowed:
              !officialSighting &&
              resolveCompetitionShotMode(stage, series, 'SIGHTING', state.seriesShotCount, 'SIGHTING').mode ===
                'SIGHTING',
            matchAllowed:
              !officialSighting &&
              !sightingRequired &&
              resolveCompetitionShotMode(stage, series, 'MATCH', state.seriesShotCount, 'MATCH').mode === 'MATCH',
            matchUnavailableReason: sightingRequired ? 'SIGHTING_REQUIRED' : null,
            selected: state.athleteTargetMode ?? null,
            effective,
          }
        : null,
  };
}
