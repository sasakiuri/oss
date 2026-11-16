import { ISSF_2026_RULE_PACKS, JRSF_2026_RULE_PACKS, type RulePack } from '@sasakiuri/saika-rules';

import type {
  CompetitionTypeDefinition,
  PhaseStartRequirement,
  PhaseStartRequirements,
} from '@/shared/competitionTypes';
import { BP60 } from '@/shared/competitionTypes/definitions/BP60';
import { BR60S } from '@/shared/competitionTypes/definitions/BR60S';
import { competitionTypeFromRulePack } from '@/shared/competitionTypes/fromRulePack';

export const LANE_COMPETITION_TYPES = [
  'BR60S',
  'BP60',
  'BR60S_FINAL',
  'BP60_FINAL',
  'AR60',
  'AP60',
  'AR60_FINAL',
  'AP60_FINAL',
  'ARMIX30',
  'APMIX30',
  'ARMIX_FINAL',
  'APMIX_FINAL',
  'R3P60',
  'R3P60_ELIMINATION',
  'R3P60_INDOOR',
  'RPR60',
  'RPR60_ELIMINATION',
  'R3P_FINAL',
  'RFPM',
  'P25',
  'CFP',
  'STDP',
  'RFPM_FINAL',
  'P25_FINAL',
  'R300_3P60',
  'R300_3P60_ELIMINATION',
  'R300_PR60',
  'R300_PR60_ELIMINATION',
  'R300_STD60',
  'R300_STD60_ELIMINATION',
  'FP60',
  'FP60_ELIMINATION',
] as const;

export type SupportedLaneCompetitionType = (typeof LANE_COMPETITION_TYPES)[number];

const RULE_PACKS_BY_EVENT_CODE: ReadonlyMap<string, RulePack> = new Map(
  [...ISSF_2026_RULE_PACKS, ...JRSF_2026_RULE_PACKS].map((pack) => [pack.eventCode, pack]),
);

/** The Beam qualifications are Director definitions; every other type is its Rule Pack's definition. */
function definitionOf(competitionType: SupportedLaneCompetitionType): CompetitionTypeDefinition {
  if (competitionType === 'BR60S') return BR60S;
  if (competitionType === 'BP60') return BP60;
  const pack = RULE_PACKS_BY_EVENT_CODE.get(competitionType);
  if (!pack) throw new Error(`Competition type ${competitionType} has no Rule Pack`);
  return competitionTypeFromRulePack(pack);
}

const definitions: Readonly<Record<SupportedLaneCompetitionType, CompetitionTypeDefinition>> = Object.freeze(
  Object.fromEntries(
    LANE_COMPETITION_TYPES.map((competitionType) => [competitionType, definitionOf(competitionType)]),
  ) as Record<SupportedLaneCompetitionType, CompetitionTypeDefinition>,
);

export interface LaneCompetitionTiming {
  readonly preparationAndSightingSeconds: number;
  /** Null when per-series timed-target programs own firing windows. */
  readonly matchSeconds: number | null;
  readonly phaseStartRequirements?: PhaseStartRequirements;
}

export function asSupportedLaneCompetitionType(value: string | undefined): SupportedLaneCompetitionType | null {
  return LANE_COMPETITION_TYPES.find((competitionType) => competitionType === value) ?? null;
}

/** Reads command defaults from the same definition used to configure Lane. */
export function getLaneCompetitionTiming(competitionType: SupportedLaneCompetitionType): LaneCompetitionTiming {
  const definition = definitions[competitionType];
  const preparation = definition.config.stages.find((stage) => stage.type === 'preparation');
  const match = definition.config.stages.find((stage) => stage.type === 'match');
  if (!preparation || !match) throw new Error(`Competition type ${competitionType} has no Lane timing`);
  return Object.freeze({
    preparationAndSightingSeconds: preparation.timer.durationSec,
    matchSeconds: definition.timedTarget ? null : match.timer.durationSec,
    ...(definition.phaseStartRequirements
      ? { phaseStartRequirements: copyPhaseStartRequirements(definition.phaseStartRequirements) }
      : {}),
  });
}

export function getLaneCompetitionDefinition(competitionType: SupportedLaneCompetitionType): CompetitionTypeDefinition {
  return definitions[competitionType];
}

function copyPhaseStartRequirements(requirements: PhaseStartRequirements): PhaseStartRequirements {
  return Object.freeze({
    ...(requirements.SIGHTING ? { SIGHTING: Object.freeze(requirements.SIGHTING.map(copyPhaseStartRequirement)) } : {}),
    ...(requirements.MATCH ? { MATCH: Object.freeze(requirements.MATCH.map(copyPhaseStartRequirement)) } : {}),
  });
}

function copyPhaseStartRequirement(requirement: PhaseStartRequirement): PhaseStartRequirement {
  return Object.freeze({
    id: requirement.id,
    description: requirement.description,
    ...(requirement.timing ? { timing: Object.freeze({ ...requirement.timing }) } : {}),
  });
}
