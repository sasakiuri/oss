import type { ShotResultProjectionCapability } from './ShotResultProjection';

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
  readonly minimumQualificationAthletes: number;
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

export interface QualificationTimedTargetRecoveryCapability {
  readonly procedure: 'QUALIFICATION';
  readonly interruption: {
    /** The threshold is strict: the interruption must be longer than this value. */
    readonly extraSightingWhenLongerThanSeconds: number;
    readonly extraSightingSeriesShots: number;
    readonly extraSightingRuleReference: string;
    /** Event-stage rules are explicit so applications do not infer recovery from labels or timer lengths. */
    readonly stages: readonly QualificationTimedTargetStageRecoveryRule[];
  };
  readonly sightingMalfunctionClaimsAllowed: false;
  readonly malfunctionClaims: {
    readonly maximum: number;
    readonly scope: 'EACH_30_SHOT_STAGE' | 'SIXTY_SHOT_MATCH';
    readonly exceptionalTwoPartMaximumPerPart?: number;
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

export function defineRulePack(pack: RulePack): RulePack {
  validateText(pack.id, 'id');
  validateText(pack.eventCode, 'eventCode');
  validateText(pack.displayName, 'displayName');
  validateText(pack.discipline, 'discipline');
  validateText(pack.authority.organization, 'authority.organization');
  validateText(pack.authority.edition, 'authority.edition');
  validateText(pack.capabilities.target.scoringProfileId, 'target.scoringProfileId');
  if (pack.capabilities.target.scoringGaugeProfileId !== undefined) {
    validateText(pack.capabilities.target.scoringGaugeProfileId, 'target.scoringGaugeProfileId');
  }
  validateIsoDate(pack.authority.effectiveFrom, 'authority.effectiveFrom');
  if (pack.authority.effectiveUntil) {
    validateIsoDate(pack.authority.effectiveUntil, 'authority.effectiveUntil');
    if (pack.authority.effectiveUntil < pack.authority.effectiveFrom) {
      throw new Error('authority.effectiveUntil must not precede authority.effectiveFrom');
    }
  }

  const stages = pack.capabilities.courseOfFire.stages;
  if (stages.length === 0) throw new Error('courseOfFire.stages must not be empty');
  for (const stage of stages) {
    validateText(stage.id, 'stage.id');
    validateText(stage.name, 'stage.name');
    if (stage.series.length === 0) throw new Error(`Stage ${stage.id} must contain a series`);
    if (!Number.isInteger(stage.timer.durationSeconds) || stage.timer.durationSeconds <= 0) {
      throw new Error(`Stage ${stage.id} timer duration must be a positive integer`);
    }
    for (const series of stage.series) {
      if (!Number.isInteger(series.shots) || series.shots < 0) {
        throw new Error(`Stage ${stage.id} series shots must be a non-negative integer`);
      }
      if (series.label !== undefined) validateText(series.label, `Stage ${stage.id} series label`);
      if (stage.phase === 'MATCH' && series.shots === 0 && series.purpose !== 'POSITION_CHANGE_AND_SIGHTING') {
        throw new Error(`Match stage ${stage.id} can use zero shots only for position change and sighting`);
      }
      if (series.purpose === 'POSITION_CHANGE_AND_SIGHTING') {
        if (stage.phase !== 'MATCH' || series.shots !== 0 || !series.position) {
          throw new Error(`Stage ${stage.id} position-change series requires a MATCH stage, zero shots, and position`);
        }
      }
      if (series.timedTargetProgramId !== undefined) {
        validateText(series.timedTargetProgramId, `Stage ${stage.id} timedTargetProgramId`);
      }
    }
    if (stage.targetProfileId !== undefined) validateText(stage.targetProfileId, `Stage ${stage.id} targetProfileId`);
    if (stage.scoringGaugeProfileId !== undefined) {
      validateText(stage.scoringGaugeProfileId, `Stage ${stage.id} scoringGaugeProfileId`);
    }
    if (stage.sightingTimedTargetProgramId !== undefined) {
      validateText(stage.sightingTimedTargetProgramId, `Stage ${stage.id} sightingTimedTargetProgramId`);
    }
    if (stage.elimination) {
      if (!Number.isInteger(stage.elimination.athletesPerCheckpoint) || stage.elimination.athletesPerCheckpoint <= 0) {
        throw new Error(`Stage ${stage.id} athletesPerCheckpoint must be a positive integer`);
      }
      if (
        stage.elimination.checkpointEverySeries !== undefined &&
        (!Number.isInteger(stage.elimination.checkpointEverySeries) || stage.elimination.checkpointEverySeries <= 0)
      ) {
        throw new Error(`Stage ${stage.id} checkpointEverySeries must be a positive integer`);
      }
    }
  }

  const totalShots = stages
    .filter((stage) => stage.phase === 'MATCH')
    .flatMap((stage) => stage.series)
    .reduce((sum, series) => sum + series.shots, 0);
  const totalSeries = stages
    .filter((stage) => stage.phase === 'MATCH')
    .flatMap((stage) => stage.series)
    .filter((series) => (series.purpose ?? 'MATCH') === 'MATCH').length;
  if (pack.capabilities.ranking.totalShots !== totalShots) {
    throw new Error(`ranking.totalShots must equal the course of fire total (${totalShots})`);
  }
  if (pack.capabilities.ranking.totalSeries !== totalSeries) {
    throw new Error(`ranking.totalSeries must equal the course of fire total (${totalSeries})`);
  }
  validateFinalRankingCheckpoints(pack);
  validateShotResultProjection(pack);
  const publication = pack.capabilities.publication;
  if (
    publication &&
    (!Number.isInteger(publication.scoreProtestWindowSeconds) || publication.scoreProtestWindowSeconds <= 0)
  ) {
    throw new Error('publication.scoreProtestWindowSeconds must be a positive integer');
  }
  const eliminationPlanning = pack.capabilities.outdoorEliminationPlanning;
  if (eliminationPlanning) {
    if (pack.round !== 'ELIMINATION') {
      throw new Error('outdoorEliminationPlanning is valid only for an ELIMINATION Rule Pack');
    }
    validatePositiveInteger(
      eliminationPlanning.minimumQualificationAthletes,
      'outdoorEliminationPlanning.minimumQualificationAthletes',
    );
    validatePositiveInteger(
      eliminationPlanning.preferredDaysBeforeQualification,
      'outdoorEliminationPlanning.preferredDaysBeforeQualification',
    );
  }
  const commands = pack.capabilities.commands;
  if (commands) {
    validatePositiveSeconds(commands.preparationAndSightingSeconds, 'commands.preparationAndSightingSeconds');
    if (commands.athleteCallToLineLeadSeconds !== undefined) {
      validatePositiveSeconds(commands.athleteCallToLineLeadSeconds, 'commands.athleteCallToLineLeadSeconds');
    }
    if (commands.sightingTargetVisibilityLeadSeconds !== undefined) {
      validatePositiveSeconds(
        commands.sightingTargetVisibilityLeadSeconds,
        'commands.sightingTargetVisibilityLeadSeconds',
      );
    }
    if (commands.setupPeriodSeconds !== undefined) {
      validatePositiveSeconds(commands.setupPeriodSeconds, 'commands.setupPeriodSeconds');
    }
    if (commands.resetPauseSeconds !== undefined) {
      validatePositiveSeconds(commands.resetPauseSeconds, 'commands.resetPauseSeconds');
    }
    validateWarnings(
      commands.preparationWarningsAtRemainingSeconds,
      commands.preparationAndSightingSeconds,
      'commands.preparationWarningsAtRemainingSeconds',
    );
    validateWarnings(commands.matchWarningsAtRemainingSeconds, undefined, 'commands.matchWarningsAtRemainingSeconds');
    if (commands.finalScript) validateFinalCommandScript(pack, commands.finalScript);
  }
  const firingWindowReview = pack.capabilities.firingWindowReview;
  if (firingWindowReview) {
    if (firingWindowReview.rules.length === 0) {
      throw new Error('firingWindowReview.rules must not be empty');
    }
    const ruleIds = new Set<string>();
    for (const rule of firingWindowReview.rules) {
      validateText(rule.id, 'firingWindowReview.rules.id');
      validateText(rule.ruleReference, `firingWindowReview rule ${rule.id} ruleReference`);
      validateText(rule.reviewGuidance, `firingWindowReview rule ${rule.id} reviewGuidance`);
      if (ruleIds.has(rule.id)) throw new Error('firingWindowReview.rules must have unique IDs');
      ruleIds.add(rule.id);
    }
  }
  validateFinalSeriesAdjudication(pack);
  validateTimedTargetCapability(pack);
  return deepFreeze(pack);
}

function validateFinalSeriesAdjudication(pack: RulePack): void {
  const capability = pack.capabilities.finalSeriesAdjudication;
  if (!capability) return;
  if (pack.round !== 'FINAL') throw new Error('finalSeriesAdjudication is only valid for Finals');
  if (capability.incidents.length === 0) throw new Error('finalSeriesAdjudication.incidents must not be empty');

  const kinds = new Set<FinalSeriesIncidentKind>();
  for (const incident of capability.incidents) {
    if (kinds.has(incident.kind)) throw new Error('finalSeriesAdjudication incidents must have unique kinds');
    kinds.add(incident.kind);
    validateText(incident.label, `finalSeriesAdjudication ${incident.kind} label`);
    validateText(incident.ruleReference, `finalSeriesAdjudication ${incident.kind} ruleReference`);
    if (incident.reviewGuidance.length === 0) {
      throw new Error(`finalSeriesAdjudication ${incident.kind} reviewGuidance must not be empty`);
    }
    incident.reviewGuidance.forEach((item) =>
      validateText(item, `finalSeriesAdjudication ${incident.kind} reviewGuidance`),
    );
    if (incident.minimumConcurringJuryMembers !== undefined) {
      validatePositiveInteger(
        incident.minimumConcurringJuryMembers,
        `finalSeriesAdjudication ${incident.kind} minimumConcurringJuryMembers`,
      );
    }
    if (incident.consequences.length === 0) {
      throw new Error(`finalSeriesAdjudication ${incident.kind} consequences must not be empty`);
    }
    for (const consequence of incident.consequences) {
      if (consequence.action === 'DEDUCT') {
        validatePositiveInteger(consequence.amount, `finalSeriesAdjudication ${incident.kind} deduction`);
        if (pack.capabilities.resultProjection?.displayUnit !== 'HITS') {
          throw new Error(
            `finalSeriesAdjudication ${incident.kind} HIT deduction requires a HIT_MISS result projection`,
          );
        }
      }
    }
  }
}

function validateTimedTargetCapability(pack: RulePack): void {
  const capability = pack.capabilities.timedTarget;
  const stages = pack.capabilities.courseOfFire.stages;
  const hasReferences = stages.some(
    (stage) =>
      stage.sightingTimedTargetProgramId !== undefined ||
      stage.series.some((series) => series.timedTargetProgramId !== undefined),
  );
  if (!capability) {
    if (hasReferences) throw new Error('courseOfFire references a missing timedTarget capability');
    return;
  }
  if (capability.programs.length === 0) throw new Error('timedTarget.programs must not be empty');

  const programsById = new Map<string, TimedTargetProgram>();
  for (const program of capability.programs) {
    validateText(program.id, 'timedTarget.programs.id');
    validateText(program.label, `Timed target program ${program.id} label`);
    validateText(program.ruleReference, `Timed target program ${program.id} ruleReference`);
    if (programsById.has(program.id)) throw new Error('timedTarget.programs must have unique IDs');
    validatePositiveSeconds(
      program.loadPreparationSeconds,
      `Timed target program ${program.id} loadPreparationSeconds`,
    );
    validatePositiveInteger(
      program.attentionDelayMilliseconds,
      `Timed target program ${program.id} attentionDelayMilliseconds`,
    );
    validateNonNegativeInteger(
      program.attentionToleranceMilliseconds,
      `Timed target program ${program.id} attentionToleranceMilliseconds`,
    );
    validateNonNegativeInteger(
      program.betweenExposuresMilliseconds,
      `Timed target program ${program.id} betweenExposuresMilliseconds`,
    );
    validatePositiveSeconds(
      program.minimumPauseAfterSeconds,
      `Timed target program ${program.id} minimumPauseAfterSeconds`,
    );
    if (program.exposures.length === 0) throw new Error(`Timed target program ${program.id} requires an exposure`);
    for (const exposure of program.exposures) {
      validatePositiveInteger(
        exposure.nominalDurationMilliseconds,
        `Timed target program ${program.id} nominalDurationMilliseconds`,
      );
      validateNonNegativeInteger(
        exposure.signalExtensionMilliseconds,
        `Timed target program ${program.id} signalExtensionMilliseconds`,
      );
      validateNonNegativeInteger(
        exposure.recordingAfterTimeMilliseconds,
        `Timed target program ${program.id} recordingAfterTimeMilliseconds`,
      );
      validatePositiveInteger(exposure.maximumShots, `Timed target program ${program.id} maximumShots`);
    }
    programsById.set(program.id, program);
  }

  const referencedIds = new Set<string>();
  for (const stage of stages) {
    if (stage.sightingTimedTargetProgramId) {
      const program = programsById.get(stage.sightingTimedTargetProgramId);
      if (!program || program.purpose !== 'SIGHTING') {
        throw new Error(`Stage ${stage.id} references an unavailable SIGHTING timed target program`);
      }
      referencedIds.add(program.id);
    }
    for (const series of stage.series) {
      if (!series.timedTargetProgramId) continue;
      const program = programsById.get(series.timedTargetProgramId);
      if (!program || program.purpose !== 'MATCH' || stage.phase !== 'MATCH') {
        throw new Error(`Stage ${stage.id} references an unavailable MATCH timed target program`);
      }
      const programShots = program.exposures.reduce((sum, exposure) => sum + exposure.maximumShots, 0);
      if (programShots !== series.shots) {
        throw new Error(`Timed target program ${program.id} shot limit must match its course-of-fire series`);
      }
      referencedIds.add(program.id);
    }
  }
  for (const step of [
    ...(pack.capabilities.commands?.finalScript?.main ?? []),
    ...(pack.capabilities.commands?.finalScript?.shootOff ?? []),
  ]) {
    if (step.effect.type === 'RUN_TIMED_TARGET') referencedIds.add(step.effect.programId);
  }
  for (const id of programsById.keys()) {
    if (!referencedIds.has(id)) {
      throw new Error(`Timed target program ${id} is not referenced by the course of fire or Final command script`);
    }
  }

  const recovery = capability.recovery;
  if (recovery.procedure === 'QUALIFICATION') {
    if (pack.round !== 'QUALIFICATION') {
      throw new Error('Qualification timed-target recovery requires a Qualification Rule Pack');
    }
    validatePositiveSeconds(
      recovery.interruption.extraSightingWhenLongerThanSeconds,
      'timedTarget.recovery.interruption.extraSightingWhenLongerThanSeconds',
    );
    validatePositiveInteger(
      recovery.interruption.extraSightingSeriesShots,
      'timedTarget.recovery.interruption.extraSightingSeriesShots',
    );
    validateText(
      recovery.interruption.extraSightingRuleReference,
      'timedTarget.recovery.interruption.extraSightingRuleReference',
    );
    if (recovery.interruption.stages.length === 0) {
      throw new Error('Qualification timed-target recovery requires a stage rule');
    }
    const recoveryStageIds = new Set<string>();
    for (const stageRule of recovery.interruption.stages) {
      validateText(stageRule.stageId, 'timedTarget.recovery.interruption.stageId');
      validateText(stageRule.ruleReference, `Timed-target recovery stage ${stageRule.stageId} ruleReference`);
      if (recoveryStageIds.has(stageRule.stageId)) {
        throw new Error('Qualification timed-target recovery stage IDs must be unique');
      }
      recoveryStageIds.add(stageRule.stageId);
      const stage = stages.find((candidate) => candidate.id === stageRule.stageId);
      if (!stage || stage.phase !== 'MATCH' || !stage.series.some((series) => series.timedTargetProgramId)) {
        throw new Error(`Timed-target recovery stage ${stageRule.stageId} must reference a timed MATCH stage`);
      }
      if (stageRule.seriesRecovery.treatment === 'COMPLETE_REMAINING_SHOTS') {
        const completion = stageRule.seriesRecovery.completion;
        if (completion.mode === 'SECONDS_PER_SHOT') {
          validatePositiveSeconds(
            completion.secondsPerShot,
            `Timed-target recovery stage ${stageRule.stageId} secondsPerShot`,
          );
        }
      }
    }
    const missingRecoveryStage = stages.find(
      (stage) =>
        stage.phase === 'MATCH' &&
        stage.series.some((series) => series.timedTargetProgramId) &&
        !recoveryStageIds.has(stage.id),
    );
    if (missingRecoveryStage) {
      throw new Error(`Timed MATCH stage ${missingRecoveryStage.id} requires a Qualification recovery rule`);
    }
  } else {
    validatePositiveSeconds(recovery.remedyReadySeconds, 'timedTarget.recovery.remedyReadySeconds');
    if (recovery.nonAllowableMalfunctionPenaltyHits !== undefined) {
      validatePositiveInteger(
        recovery.nonAllowableMalfunctionPenaltyHits,
        'timedTarget.recovery.nonAllowableMalfunctionPenaltyHits',
      );
    }
  }
  validatePositiveInteger(recovery.malfunctionClaims.maximum, 'timedTarget.recovery.malfunctionClaims.maximum');
  if (
    recovery.procedure === 'QUALIFICATION' &&
    recovery.malfunctionClaims.exceptionalTwoPartMaximumPerPart !== undefined
  ) {
    validatePositiveInteger(
      recovery.malfunctionClaims.exceptionalTwoPartMaximumPerPart,
      'timedTarget.recovery.malfunctionClaims.exceptionalTwoPartMaximumPerPart',
    );
    if (recovery.malfunctionClaims.scope !== 'SIXTY_SHOT_MATCH') {
      throw new Error('exceptionalTwoPartMaximumPerPart requires SIXTY_SHOT_MATCH scope');
    }
  }
  if (recovery.ruleReferences.length === 0) throw new Error('timedTarget.recovery.ruleReferences must not be empty');
  recovery.ruleReferences.forEach((reference) => validateText(reference, 'timedTarget.recovery.ruleReferences'));
}

function validateFinalCommandScript(pack: RulePack, script: FinalCommandScriptCapability): void {
  if (pack.round !== 'FINAL') throw new Error('commands.finalScript is only valid for Finals');
  validateText(script.version, 'commands.finalScript.version');
  if (script.source) {
    validateText(script.source.organization, 'commands.finalScript.source.organization');
    validateText(script.source.title, 'commands.finalScript.source.title');
    validateText(script.source.version, 'commands.finalScript.source.version');
  }
  if (script.main.length === 0) throw new Error('commands.finalScript.main must not be empty');
  if (script.shootOff.length === 0) throw new Error('commands.finalScript.shootOff must not be empty');

  const ids = new Set<string>();
  for (const [branch, steps] of [
    ['main', script.main],
    ['shootOff', script.shootOff],
  ] as const) {
    for (const step of steps) {
      validateText(step.id, `commands.finalScript.${branch}.id`);
      validateText(step.text, `commands.finalScript step ${step.id} text`);
      validateText(step.ruleReference, `commands.finalScript step ${step.id} ruleReference`);
      if (ids.has(step.id)) throw new Error('commands.finalScript steps must have unique IDs');
      ids.add(step.id);
      validateCommandStepTiming(step);
      validateCommandEffect(pack, step);
    }
  }
}

function validateCommandStepTiming(step: RuleCommandScriptStep): void {
  const timing = step.timing;
  if (timing.mode === 'SCHEDULED_START_OFFSET') {
    if (!Number.isInteger(timing.offsetSeconds)) {
      throw new Error(`Command step ${step.id} scheduled offset must be an integer`);
    }
    return;
  }
  if (timing.mode === 'AFTER_PREVIOUS') {
    if (!Number.isInteger(timing.delaySeconds) || timing.delaySeconds < 0) {
      throw new Error(`Command step ${step.id} delay must be a non-negative integer`);
    }
    return;
  }
  if (timing.mode === 'TIME_OR_ALL_SHOTS') {
    validatePositiveSeconds(timing.durationSeconds, `Command step ${step.id} durationSeconds`);
    validatePositiveInteger(timing.shotsPerParticipant, `Command step ${step.id} shotsPerParticipant`);
  }
}

function validateCommandEffect(pack: RulePack, step: RuleCommandScriptStep): void {
  const effect = step.effect;
  if (effect.type === 'NONE' || effect.type === 'DECLARE_RESULTS' || effect.type === 'CHECKPOINT') {
    if (effect.type === 'CHECKPOINT' && effect.afterMatchShot !== undefined) {
      validatePositiveInteger(effect.afterMatchShot, `Command step ${step.id} afterMatchShot`);
      if (effect.afterMatchShot > pack.capabilities.ranking.totalShots) {
        throw new Error(`Command step ${step.id} checkpoint exceeds the course of fire`);
      }
    }
    return;
  }

  const target = effect.target;
  const targetsCourseSeries =
    effect.purpose === 'MATCH' || (effect.type === 'RUN_TIMED_TARGET' && effect.purpose === 'SIGHTING');
  if (targetsCourseSeries) {
    if (!target) throw new Error(`Command step ${step.id} MATCH effect requires a series target`);
    const stage = pack.capabilities.courseOfFire.stages[target.stageIndex];
    if (!stage || stage.id !== target.stageId || stage.phase !== 'MATCH' || !stage.series[target.seriesIndex]) {
      throw new Error(`Command step ${step.id} targets an unavailable MATCH series`);
    }
    const seriesCount = target.seriesCount ?? 1;
    validatePositiveInteger(seriesCount, `Command step ${step.id} target seriesCount`);
    const seriesRange = stage.series.slice(target.seriesIndex, target.seriesIndex + seriesCount);
    if (seriesRange.length !== seriesCount) {
      throw new Error(`Command step ${step.id} targets an unavailable MATCH series range`);
    }
    if (effect.type === 'OPEN_FIRING' || effect.type === 'RUN_TIMED_TARGET') {
      const expectedShots = seriesRange.reduce((sum, series) => sum + series.shots, 0);
      if (effect.shotsPerParticipant !== expectedShots) {
        throw new Error(`Command step ${step.id} shots must match its course-of-fire series`);
      }
      if (effect.type === 'OPEN_FIRING' && effect.durationSeconds !== stage.timer.durationSeconds) {
        throw new Error(`Command step ${step.id} duration must match its course-of-fire timer`);
      }
    }
  } else if (target) {
    throw new Error(`Command step ${step.id} ${effect.purpose} effect must not target a MATCH series`);
  }

  if (effect.type === 'OPEN_FIRING') {
    validatePositiveSeconds(effect.durationSeconds, `Command step ${step.id} effect durationSeconds`);
    if (effect.purpose === 'SHOOT_OFF' && effect.shotsPerParticipant === undefined) {
      throw new Error(`Command step ${step.id} SHOOT_OFF effect requires shotsPerParticipant`);
    }
    if (effect.shotsPerParticipant !== undefined) {
      validatePositiveInteger(effect.shotsPerParticipant, `Command step ${step.id} effect shotsPerParticipant`);
    }
    return;
  }

  if (effect.type === 'RUN_TIMED_TARGET') {
    validateText(effect.programId, `Command step ${step.id} programId`);
    validatePositiveInteger(effect.shotsPerParticipant, `Command step ${step.id} effect shotsPerParticipant`);
    if (effect.participantSelection === 'OFFICIAL_SELECTED') {
      if (effect.requiredParticipantCount === undefined) {
        throw new Error(`Command step ${step.id} OFFICIAL_SELECTED effect requires requiredParticipantCount`);
      }
      validatePositiveInteger(
        effect.requiredParticipantCount,
        `Command step ${step.id} effect requiredParticipantCount`,
      );
    } else if (effect.requiredParticipantCount !== undefined) {
      throw new Error(`Command step ${step.id} requiredParticipantCount requires OFFICIAL_SELECTED`);
    }

    const program = pack.capabilities.timedTarget?.programs.find((candidate) => candidate.id === effect.programId);
    if (!program || program.purpose !== effect.purpose) {
      throw new Error(`Command step ${step.id} references an unavailable ${effect.purpose} timed target program`);
    }
    const programShots = program.exposures.reduce((sum, exposure) => sum + exposure.maximumShots, 0);
    if (programShots !== effect.shotsPerParticipant) {
      throw new Error(`Command step ${step.id} shot count must match timed target program ${program.id}`);
    }
    if (effect.purpose === 'SHOOT_OFF') {
      if (effect.participantSelection !== 'TIED_ONLY') {
        throw new Error(`Command step ${step.id} timed SHOOT_OFF must select tied participants only`);
      }
      if (effect.participantExecution !== 'SIMULTANEOUS' && effect.participantExecution !== 'SEQUENTIAL') {
        throw new Error(`Command step ${step.id} timed SHOOT_OFF requires a participant execution mode`);
      }
      if (effect.participantExecution === 'SEQUENTIAL') {
        if (effect.participantOrder !== 'FINAL_START_NUMBER_ASCENDING') {
          throw new Error(`Command step ${step.id} sequential SHOOT_OFF requires a participant order`);
        }
      } else if (effect.participantOrder !== undefined) {
        throw new Error(`Command step ${step.id} simultaneous SHOOT_OFF must not define a participant order`);
      }
      return;
    }
    if (effect.participantExecution !== undefined || effect.participantOrder !== undefined) {
      throw new Error(`Command step ${step.id} participant execution metadata is only valid for a SHOOT_OFF`);
    }
    if (effect.purpose === 'SIGHTING') {
      const stage = pack.capabilities.courseOfFire.stages[target!.stageIndex]!;
      if (stage.sightingTimedTargetProgramId !== program.id) {
        throw new Error(`Command step ${step.id} SIGHTING program does not match its target stage`);
      }
    } else if (effect.purpose === 'MATCH') {
      const stage = pack.capabilities.courseOfFire.stages[target!.stageIndex]!;
      const seriesCount = target!.seriesCount ?? 1;
      const mismatched = stage.series
        .slice(target!.seriesIndex, target!.seriesIndex + seriesCount)
        .some((series) => series.timedTargetProgramId !== program.id);
      if (mismatched) throw new Error(`Command step ${step.id} MATCH program does not match its target series`);
    }
  }
}

function validateFinalRankingCheckpoints(pack: RulePack): void {
  const checkpoints = pack.capabilities.ranking.finalCheckpoints;
  if (!checkpoints) return;
  if (pack.round !== 'FINAL' || pack.capabilities.ranking.strategy !== 'FINAL_SCORE') {
    throw new Error('ranking.finalCheckpoints is only valid for Finals');
  }
  const ranks = new Set<number>();
  let previousShot = 0;
  for (const checkpoint of checkpoints) {
    validatePositiveInteger(checkpoint.afterMatchShot, 'ranking.finalCheckpoints.afterMatchShot');
    if (checkpoint.afterMatchShot > pack.capabilities.ranking.totalShots) {
      throw new Error('ranking.finalCheckpoints cannot exceed the course of fire');
    }
    if (checkpoint.afterMatchShot < previousShot) {
      throw new Error('ranking.finalCheckpoints must be ordered by match shot');
    }
    if (!Number.isInteger(checkpoint.rank) || checkpoint.rank < 2) {
      throw new Error('ranking.finalCheckpoints.rank must be an integer of at least two');
    }
    if (ranks.has(checkpoint.rank)) throw new Error('ranking.finalCheckpoints ranks must be unique');
    validateFinalTieResolution(pack, checkpoint);
    ranks.add(checkpoint.rank);
    previousShot = checkpoint.afterMatchShot;
  }
}

function validateFinalTieResolution(pack: RulePack, checkpoint: FinalRankingCheckpoint): void {
  const resolution = checkpoint.tieResolution;
  if (!resolution || resolution.type === 'SHOOT_OFF' || resolution.type === 'FINAL_START_NUMBER') return;
  if (!Number.isInteger(resolution.athleteCount) || resolution.athleteCount < 2) {
    throw new Error('Final countback athleteCount must be an integer of at least two');
  }
  if (resolution.criteria.length === 0) throw new Error('Final countback criteria must not be empty');
  for (const criterion of resolution.criteria) {
    validateText(criterion.stageId, 'Final countback stageId');
    if (!Number.isInteger(criterion.seriesIndex) || criterion.seriesIndex < 0) {
      throw new Error('Final countback seriesIndex must be a non-negative integer');
    }
    const stage = pack.capabilities.courseOfFire.stages.find((candidate) => candidate.id === criterion.stageId);
    if (!stage?.series[criterion.seriesIndex] || stage.phase !== 'MATCH') {
      throw new Error(`Final countback references unavailable series ${criterion.stageId}/${criterion.seriesIndex}`);
    }
  }
}

function validateShotResultProjection(pack: RulePack): void {
  const projection = pack.capabilities.resultProjection;
  if (!projection) return;
  if (pack.capabilities.scoring.mode !== 'DECIMAL' || pack.capabilities.scoring.precision !== 1) {
    throw new Error('HIT_MISS result projection requires DECIMAL source scoring');
  }
  validateNonNegativeInteger(projection.hitThresholdX10, 'resultProjection.hitThresholdX10');
  if (projection.hitThresholdX10 > 109) {
    throw new Error('resultProjection.hitThresholdX10 must not exceed 109');
  }
  if (projection.hitValueX10 !== 10 || projection.missValueX10 !== 0) {
    throw new Error('HIT_MISS result projection must score one point per hit and zero per miss');
  }
  validateText(projection.ruleReference, 'resultProjection.ruleReference');
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function validateText(value: string, name: string): void {
  if (value.trim().length === 0) throw new Error(`${name} is required`);
}

function validateIsoDate(value: string, name: string): void {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`${name} must use YYYY-MM-DD`);
  }
}

function validatePositiveSeconds(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
}

function validatePositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
}

function validateNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
}

function validateWarnings(values: readonly number[], upperBound: number | undefined, name: string): void {
  const unique = new Set<number>();
  for (const value of values) {
    validatePositiveSeconds(value, name);
    if (upperBound !== undefined && value >= upperBound) {
      throw new Error(`${name} must occur before the timer starts`);
    }
    if (unique.has(value)) throw new Error(`${name} must not contain duplicates`);
    unique.add(value);
  }
}
