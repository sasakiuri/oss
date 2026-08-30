import {
  ISSF_2026_AP60,
  ISSF_2026_AP60_FINAL,
  ISSF_2026_APMIX30,
  ISSF_2026_APMIX_FINAL,
  ISSF_2026_AR60,
  ISSF_2026_AR60_FINAL,
  ISSF_2026_ARMIX30,
  ISSF_2026_ARMIX_FINAL,
} from '@sasakiuri/saika-rules';
import { BP60 } from '@/shared/competitionTypes/definitions/BP60';
import { BR60S } from '@/shared/competitionTypes/definitions/BR60S';
import { competitionTypeFromRulePack } from '@/shared/competitionTypes/fromRulePack';
import type {
  CompetitionTypeDefinition,
  PhaseStartRequirement,
  PhaseStartRequirements,
} from '@/shared/competitionTypes';

export const LANE_COMPETITION_TYPES = [
  'BR60S',
  'BP60',
  'AR60',
  'AP60',
  'AR60_FINAL',
  'AP60_FINAL',
  'ARMIX30',
  'APMIX30',
  'ARMIX_FINAL',
  'APMIX_FINAL',
] as const;

export type SupportedLaneCompetitionType = (typeof LANE_COMPETITION_TYPES)[number];

const definitions: Readonly<Record<SupportedLaneCompetitionType, CompetitionTypeDefinition>> = Object.freeze({
  BR60S,
  BP60,
  AR60: competitionTypeFromRulePack(ISSF_2026_AR60),
  AP60: competitionTypeFromRulePack(ISSF_2026_AP60),
  AR60_FINAL: competitionTypeFromRulePack(ISSF_2026_AR60_FINAL),
  AP60_FINAL: competitionTypeFromRulePack(ISSF_2026_AP60_FINAL),
  ARMIX30: competitionTypeFromRulePack(ISSF_2026_ARMIX30),
  APMIX30: competitionTypeFromRulePack(ISSF_2026_APMIX30),
  ARMIX_FINAL: competitionTypeFromRulePack(ISSF_2026_ARMIX_FINAL),
  APMIX_FINAL: competitionTypeFromRulePack(ISSF_2026_APMIX_FINAL),
});

export interface LaneCompetitionTiming {
  readonly preparationAndSightingSeconds: number;
  readonly matchSeconds: number;
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
    matchSeconds: match.timer.durationSec,
    ...(definition.phaseStartRequirements
      ? { phaseStartRequirements: copyPhaseStartRequirements(definition.phaseStartRequirements) }
      : {}),
  });
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
