import type {
  FinalTieResolutionPolicy,
  FinalSeriesAdjudicationCapability,
  OutdoorEliminationPlanningCapability,
  QualificationMalfunctionCapability,
  RulePackIdentity,
  ShotResultProjectionCapability,
  TimedTargetCapability,
} from '@sasakiuri/saika-rules';

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
  readonly label?: string;
  readonly position?: 'KNEELING' | 'PRONE' | 'STANDING';
  readonly purpose?: 'MATCH' | 'POSITION_CHANGE_AND_SIGHTING';
  readonly targetModeControl?: 'RANGE_OFFICIAL' | 'ATHLETE';
  readonly timedTargetProgramId?: string;
}

export interface TimerDefinition {
  readonly mode: TimerMode;
  readonly durationSec: number;
}

export interface EliminationRule {
  readonly eliminateCount: number;
  readonly unit: 'series';
  /** Number of completed series between checkpoints. Defaults to one. */
  readonly checkpointEverySeries?: number;
  readonly tieBreaker: 'shootoff';
}

export interface StageDefinition {
  readonly id?: string;
  readonly name: string;
  readonly type: 'preparation' | 'match';
  readonly series: readonly SeriesDefinition[];
  readonly timer: TimerDefinition;
  readonly elimination?: EliminationRule;
  readonly seriesTransition?: 'AUTOMATIC' | 'OFFICIAL_COMMAND';
  readonly targetProfileId?: string;
  readonly scoringGaugeProfileId?: string;
  readonly sightingTimedTargetProgramId?: string;
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
  readonly finalRuleReference?: string;
  readonly finalCheckpoints?: readonly {
    readonly afterMatchShot: number;
    readonly rank: number;
    readonly tieResolution?: FinalTieResolutionPolicy;
  }[];
  /** ISSF 6.15.1 qualification tie-break branch. */
  readonly tieBreakPolicy?: 'ISSF_FULL_RING' | 'ISSF_DECIMAL_RIFLE';
}

export interface ResultVerificationPolicy {
  /** ISSF 6.14.8 requires the ten best individual results. */
  readonly topIndividualResults: number;
  /** Set to three for event definitions that also publish team results. */
  readonly topTeamResults: number;
}

/** CRO reminder points derived from a Rule Pack or a local competition policy. */
export interface TimerAnnouncementPolicy {
  readonly preparationWarningsAtRemainingSeconds: readonly number[];
  readonly matchWarningsAtRemainingSeconds: readonly number[];
}

export type CompetitionStartPhase = 'SIGHTING' | 'MATCH';

export interface PhaseStartRequirementTiming {
  readonly durationSeconds: number;
  readonly qualifier: 'REQUIRED' | 'MINIMUM' | 'APPROXIMATE';
}

/** An application-defined acknowledgement required before a synchronized phase start. */
export interface PhaseStartRequirement {
  readonly id: string;
  readonly description: string;
  readonly timing?: PhaseStartRequirementTiming;
}

export type PhaseStartRequirements = Readonly<Partial<Record<CompetitionStartPhase, readonly PhaseStartRequirement[]>>>;

export type FiringWindowTimestampSource = 'FIRED_AT' | 'RECEIVED_AT' | 'OBSERVED_AT';

export type FiringWindowViolationKind =
  | 'BEFORE_PREPARATION_AND_SIGHTING_START'
  | 'BETWEEN_PREPARATION_AND_SIGHTING_STOP_AND_MATCH_START'
  | 'AFTER_MATCH_STOP';

/** A review rule; applying a score or classification remains a separate Jury decision. */
export interface FiringWindowDetectionRule {
  readonly id: string;
  readonly kind: FiringWindowViolationKind;
  readonly ruleReference: string;
  readonly reviewGuidance: string;
}

/** Application-specific clock policy adapted from optional Rule Pack metadata. */
export interface FiringWindowDetectionPolicy {
  readonly timestampSource: FiringWindowTimestampSource;
  readonly clockToleranceMilliseconds: number;
  readonly rules: readonly FiringWindowDetectionRule[];
}

/** Metadata understood by the current Saika Lane MQTT protocol. */
export interface LaneProtocolCapability {
  readonly discipline: string;
  readonly acc: 'RING' | 'DECIMAL';
  readonly targetProfileId?: string;
  readonly scoringGaugeProfileId?: string;
}

export interface CompetitionTypeDefinition {
  readonly id: string;
  readonly name: string;
  /** Versioned rule source. Missing for local/JRSF definitions not yet migrated. */
  readonly rulePackId?: string;
  /** Exact immutable source used for runtime compatibility and audit binding. */
  readonly rulePackIdentity?: RulePackIdentity;
  /** Runtime enforcement is an application policy and can be relaxed for practice operation. */
  readonly compatibilityMode?: 'DISABLED' | 'ADVISORY' | 'REQUIRED';
  readonly scoring: ScoringConfig;
  readonly config: RoundDefinition;
  readonly rankingStrategyId: string;
  readonly displayHints: DisplayHints;
  readonly resultFormat: ResultFormat;
  readonly resultVerification?: ResultVerificationPolicy;
  /** Optional venue-planning policy; execution and approval live in a separate Director module. */
  readonly outdoorEliminationPlanning?: OutdoorEliminationPlanningCapability;
  /** Optional 25m target schedule; execution remains in the dedicated Lane module. */
  readonly timedTarget?: TimedTargetCapability;
  /** Qualification malfunction policy; adjudication and execution stay in independent modules. */
  readonly qualificationMalfunction?: QualificationMalfunctionCapability;
  /** Result-only scoring projection; Lane protocol still advertises source accuracy. */
  readonly resultProjection?: ShotResultProjectionCapability;
  /** Team aggregation metadata; Lane still operates one athlete per firing point. */
  readonly teamFormat?: 'MIXED_PAIR';
  /** Optional so local competition types can operate without automatic reminders. */
  readonly timerAnnouncements?: TimerAnnouncementPolicy;
  /** Optional, extensible operational guards for synchronized phase starts. */
  readonly phaseStartRequirements?: PhaseStartRequirements;
  /** Optional review-only detection; local definitions may omit or replace it. */
  readonly firingWindowDetection?: FiringWindowDetectionPolicy;
  /** Optional Jury guidance; evidence and score changes stay in independent Director ledgers. */
  readonly finalSeriesAdjudication?: FinalSeriesAdjudicationCapability;
  /** Omit for definitions that cannot be run through the Lane MQTT protocol. */
  readonly laneProtocol?: LaneProtocolCapability;
}
