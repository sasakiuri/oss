// SPDX-License-Identifier: MIT

import type { SeriesDefinition, StageDefinition } from './CompetitionTypeDefinition';

export type ReportedShotMode = 'SIGHTING' | 'MATCH';

/**
 * Resolves how a target-reported shot is stored without coupling ingestion to
 * a specific ISSF event. Rule Pack adapters supply the operational metadata.
 */
export function resolveCompetitionShotMode(
  stage: StageDefinition,
  series: SeriesDefinition,
  reportedMode: ReportedShotMode | undefined,
  seriesShotCount: number,
  selection?: ReportedShotMode | null,
  sightingRequired = false,
): { mode: ReportedShotMode; nullify: boolean } {
  if (series.purpose === 'POSITION_CHANGE_AND_SIGHTING' || !stage.scored) return { mode: 'SIGHTING', nullify: false };
  if (series.targetModeControl === 'ATHLETE') {
    if (seriesShotCount > 0) return { mode: 'MATCH', nullify: false };
    const mode = selection ?? reportedMode ?? 'MATCH';
    return { mode, nullify: sightingRequired && mode === 'MATCH' };
  }
  return { mode: 'MATCH', nullify: false };
}
