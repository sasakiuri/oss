// SPDX-License-Identifier: MIT
import type {
  CompetitionRound,
  EstComplaintCapability,
  QualificationMalfunctionCapability,
  RulePackIdentity,
  ShotResultProjectionCapability,
  TimedTargetCapability,
} from '@sasakiuri/saika-rules';

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
interface SeriesOperationalMetadata {
  readonly label?: string;
  readonly position?: 'KNEELING' | 'PRONE' | 'STANDING';
  readonly purpose?: 'MATCH' | 'POSITION_CHANGE_AND_SIGHTING';
  readonly targetModeControl?: 'RANGE_OFFICIAL' | 'ATHLETE';
  readonly timedTargetProgramId?: string;
}

export type SeriesDefinition = SeriesOperationalMetadata &
  (
    | { readonly maxShots: number; readonly timer: TimerDefinition; readonly shotTimer?: never }
    | { readonly maxShots: number; readonly timer?: never; readonly shotTimer: TimerDefinition }
    | { readonly maxShots: number; readonly timer?: never; readonly shotTimer?: never }
  );

export interface StageDefinition {
  readonly id?: string;
  readonly name: string;
  readonly scored: boolean;
  readonly series: readonly SeriesDefinition[];
  readonly timer?: TimerDefinition;
  /** Whether a new session is required at stage start */
  readonly requiresNewSession: boolean;
  readonly seriesTransition?: 'AUTOMATIC' | 'OFFICIAL_COMMAND';
  readonly targetProfileId?: string;
  readonly scoringGaugeProfileId?: string;
  readonly sightingTimedTargetProgramId?: string;
}

export interface RoundConfig {
  readonly round?: CompetitionRound;
  readonly estComplaints?: EstComplaintCapability;
  readonly rulePackIdentity?: RulePackIdentity;
  readonly qualificationMalfunction?: QualificationMalfunctionCapability;
  readonly name: string;
  readonly stages: readonly StageDefinition[];
  /** Standard number of shots per series (default: 10) */
  readonly shotsPerSeries: number;
  /** Scoring mode: RING=integer score (decimal truncated), DECIMAL=decimal score (0.1 increments) */
  readonly acc: 'RING' | 'DECIMAL';
  /** Default face used when a stage does not override it. */
  readonly targetProfileId?: string;
  /** Default scoring gauge, independently selectable from the target face. */
  readonly scoringGaugeProfileId?: string;
  /** Persisted with the competition so execution does not depend on a global registry. */
  readonly timedTarget?: TimedTargetCapability;
  /** Optional result-only scoring projection; raw shot acquisition remains unchanged. */
  readonly resultProjection?: ShotResultProjectionCapability;
}

export interface CompetitionTypeDefinition {
  readonly id: string;
  readonly name: string;
  /** Versioned rule source. Missing for local/JRSF definitions not yet migrated. */
  readonly rulePackId?: string;
  /** Exact immutable source advertised to Director and checked when joining. */
  readonly rulePackIdentity?: RulePackIdentity;
  readonly discipline: string;
  readonly targetProfileId?: string;
  readonly scoringGaugeProfileId?: string;
  readonly timedTarget?: TimedTargetCapability;
  readonly resultProjection?: ShotResultProjectionCapability;
  readonly config: RoundConfig;
}
