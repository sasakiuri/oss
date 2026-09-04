import { identifyRulePack, type CommandSequenceCapability, type RulePack } from '@sasakiuri/saika-rules';
import type {
  CompetitionTypeDefinition,
  FiringWindowDetectionPolicy,
  FiringWindowTimestampSource,
  PhaseStartRequirement,
  PhaseStartRequirements,
  RoundType,
} from './CompetitionTypeDefinition';

export const RULE_PACK_CALL_TO_LINE_REQUIREMENT_ID = 'rule-pack.athletes-called-to-line';
export const RULE_PACK_SIGHTING_TARGET_VISIBILITY_REQUIREMENT_ID = 'rule-pack.sighting-targets-visible';
export const RULE_PACK_SETUP_REQUIREMENT_ID = 'rule-pack.setup-period-complete';
export const RULE_PACK_TARGET_RESET_REQUIREMENT_ID = 'rule-pack.targets-reset-for-match';
export const DEFAULT_FIRING_WINDOW_CLOCK_TOLERANCE_MILLISECONDS = 0;

export interface DirectorRulePackAdapterOptions {
  readonly maxChannels?: number;
  /** Enables team-result verification metadata for event definitions that publish team results. */
  readonly includeTeamResults?: boolean;
  /** Device-to-Director clock uncertainty near a command boundary. */
  readonly firingWindowClockToleranceMilliseconds?: number;
  /** Evidence clock used only by Director's review detector. */
  readonly firingWindowTimestampSource?: FiringWindowTimestampSource;
  /** Defaults to REQUIRED for an official, versioned Rule Pack. */
  readonly compatibilityMode?: 'DISABLED' | 'ADVISORY' | 'REQUIRED';
}

/** Adapts application-neutral rule capabilities to Director's control model. */
export function competitionTypeFromRulePack(
  pack: RulePack,
  options: DirectorRulePackAdapterOptions = {},
): CompetitionTypeDefinition {
  const course = pack.capabilities.courseOfFire;
  const ranking = pack.capabilities.ranking;
  const verification = pack.capabilities.verification;
  const commands = pack.capabilities.commands;
  const phaseStartRequirements = commands ? toPhaseStartRequirements(commands) : undefined;
  const firingWindowDetection = toFiringWindowDetection(pack, options);
  return {
    id: pack.eventCode,
    name: pack.displayName,
    rulePackId: pack.id,
    rulePackIdentity: identifyRulePack(pack),
    compatibilityMode: options.compatibilityMode ?? 'REQUIRED',
    laneProtocol: {
      discipline: pack.discipline,
      acc: pack.capabilities.scoring.mode,
      targetProfileId: pack.capabilities.target.scoringProfileId,
      ...(pack.capabilities.target.scoringGaugeProfileId
        ? { scoringGaugeProfileId: pack.capabilities.target.scoringGaugeProfileId }
        : {}),
    },
    scoring: {
      minScore: pack.capabilities.scoring.minimumShotScore,
      maxScore: pack.capabilities.scoring.maximumSeriesScore,
      precision: pack.capabilities.scoring.precision,
    },
    config: {
      name: toRoundType(pack.round),
      maxChannels: options.maxChannels ?? (pack.round === 'FINAL' ? 8 : 99),
      hasRelay: course.hasRelays,
      ...(course.maximumParticipants !== undefined ? { maxParticipants: course.maximumParticipants } : {}),
      ...(course.minimumParticipants !== undefined ? { minParticipants: course.minimumParticipants } : {}),
      stages: course.stages.map((stage) => ({
        id: stage.id,
        name: stage.name,
        type: stage.phase === 'PREPARATION' ? ('preparation' as const) : ('match' as const),
        series: stage.series.map((series) => ({
          shots: series.shots,
          ...(series.label ? { label: series.label } : {}),
          ...(series.position ? { position: series.position } : {}),
          ...(series.purpose ? { purpose: series.purpose } : {}),
          ...(series.targetModeControl ? { targetModeControl: series.targetModeControl } : {}),
          ...(series.timedTargetProgramId ? { timedTargetProgramId: series.timedTargetProgramId } : {}),
        })),
        timer: { mode: stage.timer.mode, durationSec: stage.timer.durationSeconds },
        ...(stage.seriesTransition ? { seriesTransition: stage.seriesTransition } : {}),
        ...(stage.targetProfileId ? { targetProfileId: stage.targetProfileId } : {}),
        ...(stage.scoringGaugeProfileId ? { scoringGaugeProfileId: stage.scoringGaugeProfileId } : {}),
        ...(stage.sightingTimedTargetProgramId
          ? { sightingTimedTargetProgramId: stage.sightingTimedTargetProgramId }
          : {}),
        ...(stage.elimination
          ? {
              elimination: {
                eliminateCount: stage.elimination.athletesPerCheckpoint,
                unit: stage.elimination.checkpointUnit,
                ...(stage.elimination.checkpointEverySeries !== undefined
                  ? { checkpointEverySeries: stage.elimination.checkpointEverySeries }
                  : {}),
                tieBreaker: 'shootoff' as const,
              },
            }
          : {}),
      })),
    },
    rankingStrategyId: 'standard',
    displayHints: {
      shortName: pack.eventCode,
      description: `${pack.displayName} — ${pack.authority.organization} ${pack.authority.edition}`,
    },
    resultFormat: {
      totalShots: ranking.totalShots,
      totalSeries: ranking.totalSeries,
      ...(ranking.stage1Shots !== undefined ? { stage1Shots: ranking.stage1Shots } : {}),
      ...(ranking.finalRuleReference ? { finalRuleReference: ranking.finalRuleReference } : {}),
      ...(ranking.finalCheckpoints
        ? {
            finalCheckpoints: ranking.finalCheckpoints.map((checkpoint) => ({
              ...checkpoint,
              ...(checkpoint.tieResolution?.type === 'COUNTBACK_FOR_EXACT_TIE'
                ? {
                    tieResolution: {
                      ...checkpoint.tieResolution,
                      criteria: checkpoint.tieResolution.criteria.map((criterion) => ({ ...criterion })),
                    },
                  }
                : {}),
            })),
          }
        : {}),
      ...(ranking.strategy === 'ISSF_6_15_1_DECIMAL_RIFLE'
        ? { tieBreakPolicy: 'ISSF_DECIMAL_RIFLE' as const }
        : ranking.strategy === 'ISSF_6_15_1_FULL_RING'
          ? { tieBreakPolicy: 'ISSF_FULL_RING' as const }
          : {}),
    },
    ...(pack.capabilities.team ? { teamFormat: pack.capabilities.team.format } : {}),
    ...(pack.capabilities.outdoorEliminationPlanning
      ? { outdoorEliminationPlanning: { ...pack.capabilities.outdoorEliminationPlanning } }
      : {}),
    ...(pack.capabilities.timedTarget ? { timedTarget: pack.capabilities.timedTarget } : {}),
    ...(pack.capabilities.qualificationMalfunction
      ? { qualificationMalfunction: pack.capabilities.qualificationMalfunction }
      : {}),
    ...(pack.capabilities.resultProjection ? { resultProjection: pack.capabilities.resultProjection } : {}),
    ...(pack.capabilities.finalSeriesAdjudication
      ? { finalSeriesAdjudication: pack.capabilities.finalSeriesAdjudication }
      : {}),
    ...(verification
      ? {
          resultVerification: {
            topIndividualResults: verification.topIndividualResults,
            topTeamResults: options.includeTeamResults ? verification.topTeamResultsWhenPublished : 0,
          },
        }
      : {}),
    ...(commands
      ? {
          timerAnnouncements: {
            preparationWarningsAtRemainingSeconds: [...commands.preparationWarningsAtRemainingSeconds],
            matchWarningsAtRemainingSeconds: [...commands.matchWarningsAtRemainingSeconds],
          },
        }
      : {}),
    ...(phaseStartRequirements ? { phaseStartRequirements } : {}),
    ...(firingWindowDetection ? { firingWindowDetection } : {}),
  };
}

function toFiringWindowDetection(
  pack: RulePack,
  options: DirectorRulePackAdapterOptions,
): FiringWindowDetectionPolicy | undefined {
  const capability = pack.capabilities.firingWindowReview;
  if (!capability) return undefined;

  const clockToleranceMilliseconds =
    options.firingWindowClockToleranceMilliseconds ?? DEFAULT_FIRING_WINDOW_CLOCK_TOLERANCE_MILLISECONDS;
  if (!Number.isInteger(clockToleranceMilliseconds) || clockToleranceMilliseconds < 0) {
    throw new Error('firingWindowClockToleranceMilliseconds must be a non-negative integer');
  }

  return {
    timestampSource: options.firingWindowTimestampSource ?? 'FIRED_AT',
    clockToleranceMilliseconds,
    rules: capability.rules.map((rule) => ({ ...rule })),
  };
}

function toPhaseStartRequirements(commands: CommandSequenceCapability): PhaseStartRequirements | undefined {
  const sightingRequirements: PhaseStartRequirement[] = [];
  if (commands.athleteCallToLineLeadSeconds !== undefined) {
    sightingRequirements.push({
      id: RULE_PACK_CALL_TO_LINE_REQUIREMENT_ID,
      description: 'Athletes were called to the line before the published START time.',
      timing: { durationSeconds: commands.athleteCallToLineLeadSeconds, qualifier: 'MINIMUM' },
    });
  }
  if (commands.sightingTargetVisibilityLeadSeconds !== undefined) {
    sightingRequirements.push({
      id: RULE_PACK_SIGHTING_TARGET_VISIBILITY_REQUIREMENT_ID,
      description: 'Sighting targets were visible before Preparation and Sighting began.',
      timing: { durationSeconds: commands.sightingTargetVisibilityLeadSeconds, qualifier: 'MINIMUM' },
    });
  }
  if (commands.setupPeriodSeconds !== undefined) {
    sightingRequirements.push({
      id: RULE_PACK_SETUP_REQUIREMENT_ID,
      description: 'Athletes have received the required setup period and pre-competition checks are complete.',
      timing: { durationSeconds: commands.setupPeriodSeconds, qualifier: 'REQUIRED' },
    });
  }

  const matchRequirements: PhaseStartRequirement[] = [];
  if (commands.resetPauseSeconds !== undefined) {
    matchRequirements.push({
      id: RULE_PACK_TARGET_RESET_REQUIREMENT_ID,
      description: 'All targets are reset for MATCH firing.',
      timing: { durationSeconds: commands.resetPauseSeconds, qualifier: 'APPROXIMATE' },
    });
  }

  if (sightingRequirements.length === 0 && matchRequirements.length === 0) return undefined;
  return {
    ...(sightingRequirements.length > 0 ? { SIGHTING: sightingRequirements } : {}),
    ...(matchRequirements.length > 0 ? { MATCH: matchRequirements } : {}),
  };
}

function toRoundType(round: RulePack['round']): RoundType {
  if (round === 'ELIMINATION') return 'Elimination';
  return round === 'QUALIFICATION' ? 'Qualification' : 'Final';
}
