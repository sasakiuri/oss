// SPDX-License-Identifier: MIT
/**
 * CompetitionTypeDefinition — competition type definition interfaces
 *
 * Defines the configuration of timers, series, stages, and rounds for a competition.
 * All fields are read-only.
 */

export interface TimerDefinition {
  readonly durationSeconds: number;
}

/**
 * SeriesDefinition — represents per-series timer settings as a discriminated union
 *
 * - timer: time limit for the entire series (conventional approach)
 * - shotTimer: timer reset per shot (for Final stage, future support)
 * - neither specified: no timer (delegated to stage timer)
 */
export type SeriesDefinition =
  | { readonly maxShots: number; readonly timer: TimerDefinition; readonly shotTimer?: never }
  | { readonly maxShots: number; readonly timer?: never; readonly shotTimer: TimerDefinition }
  | { readonly maxShots: number; readonly timer?: never; readonly shotTimer?: never };

export interface StageDefinition {
  readonly name: string;
  readonly scored: boolean;
  readonly series: readonly SeriesDefinition[];
  readonly timer?: TimerDefinition;
  /** Whether a new session is required at stage start */
  readonly requiresNewSession: boolean;
}

export interface RoundConfig {
  readonly name: string;
  readonly stages: readonly StageDefinition[];
  /** Standard number of shots per series (default: 10) */
  readonly shotsPerSeries: number;
  /** Scoring mode: RING=integer score (decimal truncated), DECIMAL=decimal score (0.1 increments) */
  readonly acc: 'RING' | 'DECIMAL';
}

export interface CompetitionTypeDefinition {
  readonly id: string;
  readonly name: string;
  readonly discipline: string;
  readonly config: RoundConfig;
}
