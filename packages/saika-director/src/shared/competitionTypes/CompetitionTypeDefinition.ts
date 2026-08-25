/**
 * Pure-data competition definition. RoundConfig creation is handled by an external factory.
 */
export interface ScoringConfig {
  readonly minScore: number;
  readonly maxScore: number;
  readonly precision: number;
}

export type TimerMode = 'series' | 'stage' | 'shot';

export interface SeriesDefinition {
  readonly shots: number; // 0 means unlimited (Preparation).
}

export interface TimerDefinition {
  readonly mode: TimerMode;
  readonly durationSec: number;
}

export interface EliminationRule {
  readonly eliminateCount: number;
  readonly unit: 'series';
  readonly tieBreaker: 'shootoff';
}

export interface StageDefinition {
  readonly name: string;
  readonly type: 'preparation' | 'match';
  readonly series: readonly SeriesDefinition[];
  readonly timer: TimerDefinition;
  readonly elimination?: EliminationRule;
}

export type RoundType = 'Elimination' | 'Qualification' | 'Final' | 'Individual';

export interface RoundDefinition {
  readonly name: RoundType;
  readonly maxChannels: number;
  readonly hasRelay: boolean;
  readonly stages: readonly StageDefinition[];
  readonly maxParticipants?: number;
  readonly minParticipants?: number;
}

export interface DisplayHints {
  readonly shortName: string;
  readonly description: string;
}

export interface ResultFormat {
  readonly totalShots: number;
  readonly totalSeries: number;
  readonly stage1Shots?: number; // Finals only.
}

export interface CompetitionTypeDefinition {
  readonly id: string;
  readonly name: string;
  readonly scoring: ScoringConfig;
  readonly config: RoundDefinition;
  readonly rankingStrategyId: string;
  readonly displayHints: DisplayHints;
  readonly resultFormat: ResultFormat;
}
