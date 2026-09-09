import type { EstComplaintCapability } from './EstComplaint';
import type { QualificationMalfunctionCapability } from './QualificationMalfunction';
import type { ShotResultProjectionCapability } from './ShotResultProjection';

export { defineRulePack } from './validation/defineRulePack';

export interface RuleAuthority {
  readonly organization: string;
  readonly edition: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil?: string;
  readonly ruleReferences: readonly string[];
}

export type CompetitionRound = 'ELIMINATION' | 'QUALIFICATION' | 'FINAL';
export type ScoringMode = 'RING' | 'DECIMAL';
export type RuleTimerMode = 'series' | 'stage' | 'shot';
export type ShootingPosition = 'KNEELING' | 'PRONE' | 'STANDING';
export type RuleSeriesPurpose = 'MATCH' | 'POSITION_CHANGE_AND_SIGHTING';
export type TargetModeControl = 'RANGE_OFFICIAL' | 'ATHLETE';
export type TimedTargetPurpose = 'SIGHTING' | 'MATCH' | 'SHOOT_OFF';

export interface TargetCapability {
  readonly scoringProfileId: string;
  /** Independent coordinate-scoring geometry selected by this event. */
  readonly scoringGaugeProfileId?: string;
}

export interface ScoringCapability {
  readonly mode: ScoringMode;
  readonly minimumShotScore: number;
  readonly maximumSeriesScore: number;
  readonly precision: 0 | 1;
}

export interface RuleSeries {
  /** Zero denotes unlimited sighting shots. */
  readonly shots: number;
  /** Operational label retained by application adapters. */
  readonly label?: string;
  readonly position?: ShootingPosition;
  /** Defaults to MATCH. The transition purpose must use zero shots. */
  readonly purpose?: RuleSeriesPurpose;
  /** Who may change the target between SIGHTING and MATCH while this series is current. */
  readonly targetModeControl?: TargetModeControl;
  /** Dedicated 25m timing program. Applications must not substitute their generic series timer. */
  readonly timedTargetProgramId?: string;
}

export interface RuleTimer {
  readonly mode: RuleTimerMode;
  readonly durationSeconds: number;
}

export interface RuleElimination {
  readonly athletesPerCheckpoint: number;
  readonly checkpointUnit: 'series';
  /** Number of completed series between elimination checkpoints. Defaults to one. */
  readonly checkpointEverySeries?: number;
  readonly tieResolution: 'shoot-off';
}

export interface RuleStage {
  readonly id: string;
  readonly name: string;
  readonly phase: 'PREPARATION' | 'MATCH';
  readonly series: readonly RuleSeries[];
  readonly timer: RuleTimer;
  readonly requiresNewSession: boolean;
  /** Continuous stages may advance internally without a new CRO command. */
  readonly seriesTransition?: 'AUTOMATIC' | 'OFFICIAL_COMMAND';
  readonly elimination?: RuleElimination;
  /** Overrides the Rule Pack's default scoring face while this stage is current. */
  readonly targetProfileId?: string;
  /** Overrides the Rule Pack's scoring gauge while this stage is current. */
  readonly scoringGaugeProfileId?: string;
  /** Optional commanded sighting series that runs before this MATCH stage. */
  readonly sightingTimedTargetProgramId?: string;
}

export interface CourseOfFireCapability {
  readonly hasRelays: boolean;
  readonly stages: readonly RuleStage[];
  readonly minimumParticipants?: number;
  readonly maximumParticipants?: number;
}

export interface RankingCapability {
  readonly strategy: 'ISSF_6_15_1_FULL_RING' | 'ISSF_6_15_1_DECIMAL_RIFLE' | 'FINAL_SCORE';
  readonly totalShots: number;
  readonly totalSeries: number;
  readonly stage1Shots?: number;
  /** Governing rule for Final placement checkpoints. */
  readonly finalRuleReference?: string;
  /** Explicit Final placing gates for formats that cannot be derived from a uniform interval. */
  readonly finalCheckpoints?: readonly FinalRankingCheckpoint[];
}

export interface FinalRankingCheckpoint {
  readonly afterMatchShot: number;
  readonly rank: number;
  /** Omitted checkpoints use the normal Final shoot-off rule. */
  readonly tieResolution?: FinalTieResolutionPolicy;
}

export type FinalCountbackCriterion =
  | {
      readonly type: 'SERIES_TOTAL';
      readonly stageId: string;
      readonly seriesIndex: number;
    }
  | {
      readonly type: 'REVERSE_SHOTS';
      readonly stageId: string;
      readonly seriesIndex: number;
    };

export type FinalTieResolutionPolicy =
  | { readonly type: 'SHOOT_OFF' }
  | {
      /** The lower Finals Start Number ranks higher (ISSF 6.17.4). */
      readonly type: 'FINAL_START_NUMBER';
      readonly lowerNumberRanksHigher: true;
    }
  | {
      /** Use countback only for this exact number of tied athletes; otherwise shoot off. */
      readonly type: 'COUNTBACK_FOR_EXACT_TIE';
      readonly athleteCount: number;
      readonly criteria: readonly FinalCountbackCriterion[];
      readonly otherwise: 'SHOOT_OFF';
    };

export interface VerificationCapability {
  readonly topIndividualResults: number;
  readonly topTeamResultsWhenPublished: number;
}

export interface TeamCapability {
  readonly format: 'MIXED_PAIR';
  readonly membersPerTeam: 2;
  readonly maximumTeamsPerNation: number;
  readonly requiredGenders: readonly ['F', 'M'];
}

export interface PublicationCapability {
  readonly preliminaryRequired: boolean;
  readonly scoreProtestWindowSeconds: number;
}

/** Venue-level planning rules for outdoor 50m/300m Elimination events. */
export interface OutdoorEliminationPlanningCapability {
  readonly venue: 'OUTDOOR';
  readonly requiredWhenEntriesExceedUsableCapacity: true;
  readonly waiverAuthority: 'TECHNICAL_DELEGATE';
  readonly waiverReason: 'SCHEDULE_LIMITATIONS';
  readonly completeCourseOfFire: true;
  readonly randomSquadding: true;
  readonly quotaMethod: 'PROPORTIONAL_RELAY_STARTS';
  readonly balanceTeamsAndNationsAcrossRelays: true;
  readonly minimumQualificationAthletes?: number;
  readonly preferredDaysBeforeQualification: number;
}

/** One visible/facing interval in a commanded 25m target program. */
export interface TimedTargetExposure {
  /** Firing time stated by the event rule, excluding EST tolerances. */
  readonly nominalDurationMilliseconds: number;
  /** Time the green signal remains on beyond the nominal duration (ISSF 6.4.13: 100ms). */
  readonly signalExtensionMilliseconds: number;
  /** Valid EST recording time after the green signal turns off (ISSF 6.4.13: 200ms). */
  readonly recordingAfterTimeMilliseconds: number;
  /** Maximum shots accepted in this individual exposure. */
  readonly maximumShots: number;
}

/**
 * Transport- and device-neutral timing data. A Lane adapter may drive lamps,
 * turning targets, a renderer, or a test sink from the same absolute schedule.
 */
export interface TimedTargetProgram {
  readonly id: string;
  readonly label: string;
  readonly purpose: TimedTargetPurpose;
  readonly ruleReference: string;
  readonly loadPreparationSeconds: number;
  readonly attentionDelayMilliseconds: number;
  readonly attentionToleranceMilliseconds: number;
  /** Red/edge-on time from one green-off boundary to the next green-on boundary. */
  readonly betweenExposuresMilliseconds: number;
  /** Earliest permitted next LOAD, measured from the end of this program. */
  readonly minimumPauseAfterSeconds: number;
  /** Separate official-command pause; applications choose its enforcement policy. */
  readonly unloadPause?: { readonly minimumSeconds: number; readonly ruleReference: string };
  readonly exposures: readonly TimedTargetExposure[];
}

export type QualificationTimedTargetSeriesRecoveryRule =
  | {
      readonly treatment: 'ANNUL_AND_REPEAT';
    }
  | {
      readonly treatment: 'COMPLETE_REMAINING_SHOTS';
      readonly completion:
        | {
            readonly mode: 'SECONDS_PER_SHOT';
            readonly secondsPerShot: number;
          }
        | {
            readonly mode: 'FIRST_EXPOSURE_OF_NEXT_SERIES';
          };
    };

export interface QualificationTimedTargetStageRecoveryRule {
  readonly stageId: string;
  readonly seriesRecovery: QualificationTimedTargetSeriesRecoveryRule;
  readonly ruleReference: string;
}

export interface MissingShotComplaintProcedure {
  readonly notification: 'BEFORE_NEXT_SHOT' | 'AFTER_SERIES';
  readonly seriesRepeatAllowed: false;
  readonly ruleReference: string;
}

export interface QualificationTimedTargetRecoveryCapability {
  readonly missingShotComplaints?: readonly (MissingShotComplaintProcedure & { readonly stageId: string })[];
  readonly procedure: 'QUALIFICATION';
  /** Target-system failure is independent from ordinary interruption duration. */
  readonly targetFailure?: {
    readonly extraSightingSeriesShots: number;
    readonly minimumPauseAfterSightingSeconds: number;
    readonly stages: readonly QualificationTimedTargetStageRecoveryRule[];
    readonly ruleReferences: readonly string[];
  };
  readonly interruption: {
    /** The threshold is strict: the interruption must be longer than this value. */
    readonly extraSightingWhenLongerThanSeconds: number;
    readonly extraSightingSeriesShots: number;
    readonly extraSightingRuleReference: string;
    /** Event-stage rules are explicit so applications do not infer recovery from labels or timer lengths. */
    readonly stages: readonly QualificationTimedTargetStageRecoveryRule[];
  };
  readonly ruleReferences: readonly string[];
}

export interface FinalTimedTargetRecoveryCapability {
  readonly procedure: 'FINAL';
  readonly sightingMalfunctionClaimsAllowed: false;
  readonly malfunctionClaims: {
    readonly maximum: 1;
    readonly scope: 'FINAL';
  };
  readonly allowableMalfunctionRemedy: 'REPEAT_SERIES' | 'COMPLETE_SERIES';
  readonly remedyReadySeconds: number;
  readonly nonAllowableMalfunctionPenaltyHits?: number;
  readonly ruleReferences: readonly string[];
}

export type TimedTargetRecoveryCapability =
  QualificationTimedTargetRecoveryCapability | FinalTimedTargetRecoveryCapability;

export interface TimedTargetCapability {
  readonly signalSystem: 'EST_RED_GREEN_OR_TURNING_TARGETS';
  readonly programs: readonly TimedTargetProgram[];
  /** Policy metadata only; Jury decisions and score changes remain outside the timing engine. */
  readonly recovery: TimedTargetRecoveryCapability;
}

export type RuleCommandActor = 'OFFICIAL' | 'CRO' | 'ANNOUNCER';
export type RuleCommandStepKind = 'CHECK' | 'COMMAND' | 'ANNOUNCEMENT' | 'DECLARATION';
export type RuleCommandFiringPurpose = 'SIGHTING' | 'MATCH' | 'SHOOT_OFF';
export type RuleCommandParticipantSelection = 'ALL_ACTIVE' | 'TIED_ONLY' | 'OFFICIAL_SELECTED';
export type RuleCommandParticipantExecution = 'SIMULTANEOUS' | 'SEQUENTIAL';
export type RuleCommandParticipantOrder = 'FINAL_START_NUMBER_ASCENDING';

export type RuleCommandStepTiming =
  | {
      readonly mode: 'SCHEDULED_START_OFFSET';
      /** Signed offset from the published Final START. */
      readonly offsetSeconds: number;
    }
  | {
      readonly mode: 'AFTER_PREVIOUS';
      readonly delaySeconds: number;
    }
  | {
      readonly mode: 'TIME_OR_ALL_SHOTS';
      readonly durationSeconds: number;
      readonly shotsPerParticipant: number;
    }
  | { readonly mode: 'MANUAL' };

export interface RuleCommandSeriesTarget {
  readonly stageId: string;
  readonly stageIndex: number;
  readonly seriesIndex: number;
  /** Contiguous series controlled by one firing window. Defaults to one. */
  readonly seriesCount?: number;
}

type RuleCommandCourseTimedTargetEffect = {
  /** Arms an absolute-time target program; the program owns all signal edges. */
  readonly type: 'RUN_TIMED_TARGET';
  readonly purpose: 'SIGHTING' | 'MATCH';
  readonly participantSelection: RuleCommandParticipantSelection;
  readonly programId: string;
  readonly shotsPerParticipant: number;
  readonly target: RuleCommandSeriesTarget;
  /** Required for an operator-selected group so adapters can reject accidental over-selection. */
  readonly requiredParticipantCount?: number;
  readonly participantExecution?: never;
  readonly participantOrder?: never;
};

type RuleCommandShootOffTimedTargetEffect = {
  /** Runs the tie-breaking program without advancing or writing into the MATCH course of fire. */
  readonly type: 'RUN_TIMED_TARGET';
  readonly purpose: 'SHOOT_OFF';
  readonly participantSelection: 'TIED_ONLY';
  readonly programId: string;
  readonly shotsPerParticipant: number;
  readonly target?: never;
  readonly requiredParticipantCount?: never;
  readonly participantExecution: RuleCommandParticipantExecution;
  /** Required only when participants must fire one after another. */
  readonly participantOrder?: RuleCommandParticipantOrder;
};

export type RuleCommandEffect =
  | { readonly type: 'NONE' }
  | {
      readonly type: 'LOAD';
      readonly purpose: RuleCommandFiringPurpose;
      readonly participantSelection: RuleCommandParticipantSelection;
      readonly target?: RuleCommandSeriesTarget;
    }
  | {
      readonly type: 'OPEN_FIRING';
      readonly purpose: RuleCommandFiringPurpose;
      readonly participantSelection: RuleCommandParticipantSelection;
      readonly durationSeconds: number;
      /** Omitted for unlimited Preparation and Sighting shots. */
      readonly shotsPerParticipant?: number;
      readonly target?: RuleCommandSeriesTarget;
    }
  | RuleCommandCourseTimedTargetEffect
  | RuleCommandShootOffTimedTargetEffect
  | {
      readonly type: 'CLOSE_FIRING';
      readonly purpose: RuleCommandFiringPurpose;
      readonly target?: RuleCommandSeriesTarget;
    }
  | {
      readonly type: 'CHECKPOINT';
      readonly afterMatchShot?: number;
    }
  | { readonly type: 'DECLARE_RESULTS' };

/**
 * A transport- and UI-neutral script. Applications decide how an official
 * confirms a cue, how it is persisted, and how Lane commands are delivered.
 */
export interface RuleCommandScriptStep {
  readonly id: string;
  readonly actor: RuleCommandActor;
  readonly kind: RuleCommandStepKind;
  readonly text: string;
  readonly ruleReference: string;
  readonly timing: RuleCommandStepTiming;
  readonly effect: RuleCommandEffect;
}

export interface FinalCommandScriptCapability {
  readonly version: string;
  /** Human-readable provenance retained with every immutable Final run. */
  readonly source?: {
    readonly organization: string;
    readonly title: string;
    readonly version: string;
  };
  readonly main: readonly RuleCommandScriptStep[];
  /** Insertable repeatable branch used only for the selected tied participants. */
  readonly shootOff: readonly RuleCommandScriptStep[];
}

export interface CommandSequenceCapability {
  /** Minimum interval between calling athletes to the line and the published START time. */
  readonly athleteCallToLineLeadSeconds?: number;
  /** Minimum interval that sighting targets are visible before Preparation and Sighting begins. */
  readonly sightingTargetVisibilityLeadSeconds?: number;
  /** Setup allowance before Preparation and Sighting begins. */
  readonly setupPeriodSeconds?: number;
  readonly preparationAndSightingSeconds: number;
  readonly preparationWarningsAtRemainingSeconds: readonly number[];
  readonly matchWarningsAtRemainingSeconds: readonly number[];
  /** Advisory target-reset pause before the CRO starts MATCH firing. */
  readonly resetPauseSeconds?: number;
  /** Optional fully ordered script for Finals operation. */
  readonly finalScript?: FinalCommandScriptCapability;
}

/** A firing interval that requires CRO/Jury review when a shot is observed. */
export type FiringWindowReviewKind =
  | 'BEFORE_PREPARATION_AND_SIGHTING_START'
  | 'BETWEEN_PREPARATION_AND_SIGHTING_STOP_AND_MATCH_START'
  | 'AFTER_MATCH_STOP';

/**
 * Application-neutral rule metadata. Detection tolerances, clocks, storage,
 * notifications, and scoring decisions belong to application adapters.
 */
export interface FiringWindowReviewRule {
  readonly id: string;
  readonly kind: FiringWindowReviewKind;
  readonly ruleReference: string;
  readonly reviewGuidance: string;
}

export interface FiringWindowReviewCapability {
  readonly rules: readonly FiringWindowReviewRule[];
}

export type FinalSeriesIncidentKind = 'LATE_OR_UNFIRED_SHOT' | 'MULTIPLE_SHOTS_SAME_TARGET' | 'READY_POSITION';

export type FinalSeriesIncidentConsequence =
  | {
      readonly when: 'EACH_OCCURRENCE' | 'FIRST_VIOLATION';
      readonly action: 'DEDUCT';
      readonly amount: number;
      readonly unit: 'HITS';
      /** Describes the source-shot ruling separately from the result deduction. */
      readonly sourceShotTreatment?: 'MISS';
    }
  | {
      readonly when: 'SECOND_OR_LATER';
      readonly action: 'DISQUALIFY';
      readonly classification: 'DSQ';
    };

/** Rule metadata only; evidence capture and Jury scoring decisions remain application concerns. */
export interface FinalSeriesIncidentRule {
  readonly kind: FinalSeriesIncidentKind;
  readonly label: string;
  readonly ruleReference: string;
  readonly reviewGuidance: readonly string[];
  readonly minimumConcurringJuryMembers?: number;
  readonly warningBeforePenalty: boolean;
  readonly consequences: readonly FinalSeriesIncidentConsequence[];
}

export interface FinalSeriesAdjudicationCapability {
  readonly incidents: readonly FinalSeriesIncidentRule[];
}

export interface RulePackCapabilities {
  readonly estComplaints?: EstComplaintCapability;
  readonly target: TargetCapability;
  readonly scoring: ScoringCapability;
  /** Optional competition-result projection; acquisition scores remain unchanged. */
  readonly resultProjection?: ShotResultProjectionCapability;
  readonly courseOfFire: CourseOfFireCapability;
  readonly ranking: RankingCapability;
  readonly verification?: VerificationCapability;
  readonly team?: TeamCapability;
  readonly publication?: PublicationCapability;
  readonly outdoorEliminationPlanning?: OutdoorEliminationPlanningCapability;
  readonly timedTarget?: TimedTargetCapability;
  readonly commands?: CommandSequenceCapability;
  readonly firingWindowReview?: FiringWindowReviewCapability;
  readonly finalSeriesAdjudication?: FinalSeriesAdjudicationCapability;
  /** Qualification/Elimination firearm-malfunction policy; adjudication remains application-owned. */
  readonly qualificationMalfunction?: QualificationMalfunctionCapability;
}

/**
 * Versioned source definition. Applications consume it through adapters and
 * never add renderer, persistence, transport, or device concerns here.
 */
export interface RulePack {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly eventCode: string;
  readonly displayName: string;
  readonly discipline: string;
  readonly round: CompetitionRound;
  readonly authority: RuleAuthority;
  readonly capabilities: RulePackCapabilities;
}
