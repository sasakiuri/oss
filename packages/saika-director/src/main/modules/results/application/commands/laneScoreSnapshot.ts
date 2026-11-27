// SPDX-License-Identifier: MIT
import type { CompetitionTypeDefinition } from '@/shared/competitionTypes';
import type { LaneScorePayload } from '@sasakiuri/saika-protocol/LaneScore';

/** Returns the Lane scoring mode that the competition type's precision requires. */
export function expectedScoreMode(definition: CompetitionTypeDefinition): LaneScorePayload['acc'] {
  return definition.scoring.precision === 0 ? 'RING' : 'DECIMAL';
}

/** Returns the snapshot's shot values in stage and series order. */
export function flattenShots(score: LaneScorePayload): number[] {
  return [...score.stages]
    .sort((left, right) => left.stageIndex - right.stageIndex)
    .flatMap((stage) =>
      [...stage.series]
        .sort((left, right) => left.seriesIndex - right.seriesIndex)
        .flatMap((series) => series.shots.map((shot) => shot / 10)),
    );
}

/** Adds score values and rounds the sum to tenths, the precision that scores are kept in. */
export function sumShots(values: readonly number[]): number {
  return Math.round(values.reduce((total, value) => total + value, 0) * 10) / 10;
}
