// SPDX-License-Identifier: MIT

import type { SeriesDefinition, StageDefinition } from './CompetitionTypeDefinition';

export type ReportedShotMode = 'SIGHTING' | 'MATCH';

export function isAthleteTargetSwitchSeries(stage: StageDefinition, series: SeriesDefinition): boolean {
  return stage.scored && series.targetModeControl === 'ATHLETE' && series.purpose !== 'POSITION_CHANGE_AND_SIGHTING';
}

export function previousPositionLabel(stage: StageDefinition | undefined, seriesIndex: number): string {
  const position = stage?.series[seriesIndex - 1]?.position;
  const names = { KNEELING: 'Kneeling', PRONE: 'Prone', STANDING: 'Standing' };
  return `previous ${position ? names[position] : 'unknown'} position`;
}

/**
 * Resolves how a target-reported shot is stored without coupling ingestion to
 * a specific ISSF event. Rule Pack adapters supply the operational metadata.
 */
export function resolveCompetitionShotMode(
  stage: StageDefinition,
  series: SeriesDefinition,
  reportedMode: ReportedShotMode | undefined,
  seriesShotCount: number,
  selection: ReportedShotMode | null | undefined,
  sightingRequired: boolean,
): { mode: ReportedShotMode; nullify: boolean } {
  if (series.purpose === 'POSITION_CHANGE_AND_SIGHTING' || !stage.scored) return { mode: 'SIGHTING', nullify: false };
  if (isAthleteTargetSwitchSeries(stage, series)) {
    if (seriesShotCount > 0) return { mode: 'MATCH', nullify: false };
    const mode = selection ?? reportedMode ?? 'MATCH';
    return { mode, nullify: sightingRequired && mode === 'MATCH' };
  }
  return { mode: 'MATCH', nullify: false };
}
