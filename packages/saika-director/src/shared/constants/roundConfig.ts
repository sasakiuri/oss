// src/shared/constants/roundConfig.ts

import type {
  CompetitionTypeDefinition,
  RoundType,
  StageDefinition,
} from '@/shared/competitionTypes/CompetitionTypeDefinition';

/**
 * Unified competition round configuration.
 *
 * Mirrors the Stage → Series[] → shots hierarchy.
 * Each Match action advances one series.
 */

export interface RoundConfig {
  readonly roundType: RoundType;
  readonly maxChannels: number;
  readonly hasRelay: boolean;
  readonly stages: readonly StageDefinition[];
  /** Elimination schedule: seriesIndex → eliminateRank (for the second stage). */
  readonly eliminationSchedule: Readonly<Record<number, number>>;
  /** Index of the elimination stage; undefined means no eliminations. */
  readonly eliminationStageIndex?: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Builds a series-based elimination schedule as seriesIndex → eliminateRank.
 *
 * Starts with participantCount athletes and eliminates one after each series until two remain.
 */
function buildSeriesEliminationSchedule(participantCount: number, totalSeries: number): Record<number, number> {
  const schedule: Record<number, number> = {};
  // Fewer participants delay the first elimination series.
  const firstEliminationSeries = Math.max(0, totalSeries - (participantCount - 1));

  for (let rank = participantCount; rank >= 2; rank--) {
    const seriesIndex = firstEliminationSeries + (participantCount - rank);
    if (seriesIndex < totalSeries) {
      schedule[seriesIndex] = rank;
    }
  }

  return schedule;
}

// ---------------------------------------------------------------------------
// Unified factory based on CompetitionTypeDefinition
// ---------------------------------------------------------------------------

/**
 * Builds a RoundConfig from a CompetitionTypeDefinition.
 *
 * Validates an optional participant count and builds its elimination schedule.
 */
export function buildRoundConfig(def: CompetitionTypeDefinition, participantCount?: number): RoundConfig {
  const { config } = def;

  // Validate participant count.
  if (participantCount !== undefined) {
    if (config.minParticipants !== undefined && participantCount < config.minParticipants) {
      throw new Error(`Invalid participant count: ${participantCount}. Must be at least ${config.minParticipants}`);
    }
    if (config.maxParticipants !== undefined && participantCount > config.maxParticipants) {
      throw new Error(`Invalid participant count: ${participantCount}. Must be at most ${config.maxParticipants}`);
    }
  }

  // Locate the elimination stage.
  const eliminationStageIndex = config.stages.findIndex((s) => s.elimination !== undefined);
  const eliminationStage = eliminationStageIndex >= 0 ? config.stages[eliminationStageIndex] : undefined;

  const eliminationSchedule =
    eliminationStage && participantCount !== undefined
      ? buildSeriesEliminationSchedule(participantCount, eliminationStage.series.length)
      : {};

  return {
    roundType: config.name,
    maxChannels: config.maxChannels,
    hasRelay: config.hasRelay,
    stages: config.stages,
    eliminationSchedule,
    ...(eliminationStageIndex >= 0 ? { eliminationStageIndex } : {}),
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Returns the total number of scoring shots in a RoundConfig. */
export function getTotalScoredShots(config: RoundConfig): number {
  let total = 0;
  for (const stage of config.stages) {
    if (stage.type === 'match') {
      for (const series of stage.series) {
        total += series.shots;
      }
    }
  }
  return total;
}

/** Returns the scoring-shot total before the specified stage. */
export function totalShotsBeforeStage(config: RoundConfig, stageIndex: number): number {
  let total = 0;
  for (let i = 0; i < stageIndex; i++) {
    const stage = config.stages[i];
    if (stage && stage.type === 'match') {
      for (const series of stage.series) {
        total += series.shots;
      }
    }
  }
  return total;
}
