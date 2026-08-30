export interface RuleAuthority {
  readonly organization: string;
  readonly edition: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil?: string;
  readonly ruleReferences: readonly string[];
}

export type CompetitionRound = 'QUALIFICATION' | 'FINAL';
export type ScoringMode = 'RING' | 'DECIMAL';
export type RuleTimerMode = 'series' | 'stage' | 'shot';

export interface TargetCapability {
  readonly scoringProfileId: string;
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
  readonly elimination?: RuleElimination;
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
}

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

export type RuleCommandActor = 'OFFICIAL' | 'CRO' | 'ANNOUNCER';
export type RuleCommandStepKind = 'CHECK' | 'COMMAND' | 'ANNOUNCEMENT' | 'DECLARATION';
export type RuleCommandFiringPurpose = 'SIGHTING' | 'MATCH' | 'SHOOT_OFF';
export type RuleCommandParticipantSelection = 'ALL_ACTIVE' | 'TIED_ONLY';

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
}

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

export interface RulePackCapabilities {
  readonly target: TargetCapability;
  readonly scoring: ScoringCapability;
  readonly courseOfFire: CourseOfFireCapability;
  readonly ranking: RankingCapability;
  readonly verification?: VerificationCapability;
  readonly team?: TeamCapability;
  readonly publication?: PublicationCapability;
  readonly commands?: CommandSequenceCapability;
  readonly firingWindowReview?: FiringWindowReviewCapability;
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
      if (stage.phase === 'MATCH' && series.shots === 0) {
        throw new Error(`Match stage ${stage.id} cannot have unlimited shots`);
      }
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
    .reduce((sum, stage) => sum + stage.series.length, 0);
  if (pack.capabilities.ranking.totalShots !== totalShots) {
    throw new Error(`ranking.totalShots must equal the course of fire total (${totalShots})`);
  }
  if (pack.capabilities.ranking.totalSeries !== totalSeries) {
    throw new Error(`ranking.totalSeries must equal the course of fire total (${totalSeries})`);
  }
  const publication = pack.capabilities.publication;
  if (
    publication &&
    (!Number.isInteger(publication.scoreProtestWindowSeconds) || publication.scoreProtestWindowSeconds <= 0)
  ) {
    throw new Error('publication.scoreProtestWindowSeconds must be a positive integer');
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
  return deepFreeze(pack);
}

function validateFinalCommandScript(pack: RulePack, script: FinalCommandScriptCapability): void {
  if (pack.round !== 'FINAL') throw new Error('commands.finalScript is only valid for Finals');
  validateText(script.version, 'commands.finalScript.version');
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
    if (!Number.isInteger(timing.offsetSeconds) || timing.offsetSeconds > 0) {
      throw new Error(`Command step ${step.id} scheduled offset must be a non-positive integer`);
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
  if (effect.purpose === 'MATCH') {
    if (!target) throw new Error(`Command step ${step.id} MATCH effect requires a series target`);
    const stage = pack.capabilities.courseOfFire.stages[target.stageIndex];
    if (!stage || stage.id !== target.stageId || stage.phase !== 'MATCH' || !stage.series[target.seriesIndex]) {
      throw new Error(`Command step ${step.id} targets an unavailable MATCH series`);
    }
    if (effect.type === 'OPEN_FIRING') {
      const series = stage.series[target.seriesIndex]!;
      if (effect.shotsPerParticipant !== series.shots) {
        throw new Error(`Command step ${step.id} shots must match its course-of-fire series`);
      }
      if (effect.durationSeconds !== stage.timer.durationSeconds) {
        throw new Error(`Command step ${step.id} duration must match its course-of-fire timer`);
      }
    }
  } else if (target) {
    throw new Error(`Command step ${step.id} ${effect.purpose} effect must not target a MATCH series`);
  }

  if (effect.type === 'OPEN_FIRING') {
    validatePositiveSeconds(effect.durationSeconds, `Command step ${step.id} effect durationSeconds`);
    if (effect.shotsPerParticipant !== undefined) {
      validatePositiveInteger(effect.shotsPerParticipant, `Command step ${step.id} effect shotsPerParticipant`);
    }
  }
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
