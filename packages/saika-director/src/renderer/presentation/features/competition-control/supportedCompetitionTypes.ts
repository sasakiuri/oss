import { BR60S_FINAL } from '@/shared/competitionTypes/definitions/BR60S_FINAL';
import { BP60_FINAL } from '@/shared/competitionTypes/definitions/BP60_FINAL';
import {
  ISSF_2026_R300_3P60,
  ISSF_2026_R300_3P60_ELIMINATION,
  ISSF_2026_R300_PR60,
  ISSF_2026_R300_PR60_ELIMINATION,
  ISSF_2026_R300_STD60,
  ISSF_2026_R300_STD60_ELIMINATION,
  ISSF_2026_FP60,
  ISSF_2026_FP60_ELIMINATION,
  ISSF_2026_AP60,
  ISSF_2026_AP60_FINAL,
  ISSF_2026_APMIX30,
  ISSF_2026_APMIX_FINAL,
  ISSF_2026_CFP,
  ISSF_2026_AR60,
  ISSF_2026_AR60_FINAL,
  ISSF_2026_ARMIX30,
  ISSF_2026_ARMIX_FINAL,
  ISSF_2026_R3P60,
  ISSF_2026_R3P60_ELIMINATION,
  ISSF_2026_R3P60_INDOOR,
  ISSF_2026_R3P_FINAL,
  ISSF_2026_RPR60,
  ISSF_2026_RPR60_ELIMINATION,
  ISSF_2026_P25,
  ISSF_2026_P25_FINAL,
  ISSF_2026_RFPM,
  ISSF_2026_RFPM_FINAL,
  ISSF_2026_STDP,
} from '@sasakiuri/saika-rules';

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

const definitions: Readonly<Record<SupportedLaneCompetitionType, CompetitionTypeDefinition>> = Object.freeze({
  R300_3P60: competitionTypeFromRulePack(ISSF_2026_R300_3P60),
  R300_3P60_ELIMINATION: competitionTypeFromRulePack(ISSF_2026_R300_3P60_ELIMINATION),
  R300_PR60: competitionTypeFromRulePack(ISSF_2026_R300_PR60),
  R300_PR60_ELIMINATION: competitionTypeFromRulePack(ISSF_2026_R300_PR60_ELIMINATION),
  R300_STD60: competitionTypeFromRulePack(ISSF_2026_R300_STD60),
  R300_STD60_ELIMINATION: competitionTypeFromRulePack(ISSF_2026_R300_STD60_ELIMINATION),
  FP60: competitionTypeFromRulePack(ISSF_2026_FP60),
  FP60_ELIMINATION: competitionTypeFromRulePack(ISSF_2026_FP60_ELIMINATION),
  BR60S,
  BP60,
  BR60S_FINAL,
  BP60_FINAL,
  AR60: competitionTypeFromRulePack(ISSF_2026_AR60),
  AP60: competitionTypeFromRulePack(ISSF_2026_AP60),
  AR60_FINAL: competitionTypeFromRulePack(ISSF_2026_AR60_FINAL),
  AP60_FINAL: competitionTypeFromRulePack(ISSF_2026_AP60_FINAL),
  ARMIX30: competitionTypeFromRulePack(ISSF_2026_ARMIX30),
  APMIX30: competitionTypeFromRulePack(ISSF_2026_APMIX30),
  ARMIX_FINAL: competitionTypeFromRulePack(ISSF_2026_ARMIX_FINAL),
  APMIX_FINAL: competitionTypeFromRulePack(ISSF_2026_APMIX_FINAL),
  R3P60: competitionTypeFromRulePack(ISSF_2026_R3P60),
  R3P60_ELIMINATION: competitionTypeFromRulePack(ISSF_2026_R3P60_ELIMINATION),
  R3P60_INDOOR: competitionTypeFromRulePack(ISSF_2026_R3P60_INDOOR),
  RPR60: competitionTypeFromRulePack(ISSF_2026_RPR60),
  RPR60_ELIMINATION: competitionTypeFromRulePack(ISSF_2026_RPR60_ELIMINATION),
  R3P_FINAL: competitionTypeFromRulePack(ISSF_2026_R3P_FINAL),
  RFPM: competitionTypeFromRulePack(ISSF_2026_RFPM),
  P25: competitionTypeFromRulePack(ISSF_2026_P25),
  CFP: competitionTypeFromRulePack(ISSF_2026_CFP),
  STDP: competitionTypeFromRulePack(ISSF_2026_STDP),
  RFPM_FINAL: competitionTypeFromRulePack(ISSF_2026_RFPM_FINAL),
  P25_FINAL: competitionTypeFromRulePack(ISSF_2026_P25_FINAL),
});

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
