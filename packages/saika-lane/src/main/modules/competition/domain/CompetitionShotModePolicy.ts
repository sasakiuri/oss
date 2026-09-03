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
): ReportedShotMode {
  if (series.purpose === 'POSITION_CHANGE_AND_SIGHTING') return 'SIGHTING';
  if (!stage.scored) return 'SIGHTING';
  if (series.targetModeControl === 'ATHLETE' && reportedMode !== undefined) return reportedMode;
  return 'MATCH';
}
