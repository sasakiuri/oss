// SPDX-License-Identifier: MIT
import { createHash } from 'node:crypto';
import { ISSF_2026_RULE_PACKS, canonicalJson } from '@sasakiuri/saika-rules';
import { VistaDefinitionSchema, type VistaDefinition } from '@sasakiuri/saika-protocol/Vista';
import type { CompetitionStatePayload } from '@/shared/mqtt';
import type { CompetitionTypeDefinition, CompetitionTypeRegistry } from '@/shared/competitionTypes';
import { competitionTypeFromRulePack } from '@/shared/competitionTypes/fromRulePack';
import { BR60S } from '@/shared/competitionTypes/definitions/BR60S';
import { BP60 } from '@/shared/competitionTypes/definitions/BP60';
import { BR60S_FINAL } from '@/shared/competitionTypes/definitions/BR60S_FINAL';
import { BP60_FINAL } from '@/shared/competitionTypes/definitions/BP60_FINAL';

export function vistaDigest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

const standardDefinitions = new Map<string, CompetitionTypeDefinition>([
  ...[BR60S, BP60, BR60S_FINAL, BP60_FINAL].map((definition) => [definition.id, definition] as const),
  ...ISSF_2026_RULE_PACKS.filter((pack) => ['AR60', 'AP60', 'AR60_FINAL', 'AP60_FINAL'].includes(pack.eventCode)).map(
    (pack) =>
      [pack.eventCode, competitionTypeFromRulePack(pack, { includeTeamResults: pack.round !== 'FINAL' })] as const,
  ),
]);

/** Frozen source geometry follows Lane's documented TargetScoringProfile values. */
export function directorVistaDefinition(
  competition: CompetitionStatePayload,
  registry: CompetitionTypeRegistry,
): VistaDefinition {
  const definition = registry.get(competition.competitionTypeId);
  const standard = standardDefinitions.get(definition.id);
  if (!standard || competition.competitionUnit === 'MIXED_TEAM' || definition.teamFormat) {
    throw new Error('Vista supports standard individual 10m air and beam competitions only');
  }
  if (vistaDigest(definition) !== vistaDigest(standard))
    throw new Error('Custom competition definition is unsupported');
  if (
    standard.rulePackIdentity &&
    vistaDigest(competition.definitionBinding?.rulePack ?? null) !== vistaDigest(standard.rulePackIdentity)
  ) {
    throw new Error('Exact competition Rule Pack identity is missing or differs from the selected definition');
  }
  const rifle = ['AR60', 'AR60_FINAL', 'BR60S', 'BR60S_FINAL'].includes(definition.id);
  const beam = definition.id.startsWith('B');
  const profileId = beam
    ? `JRSF_BEAM_${rifle ? 'RIFLE' : 'PISTOL'}_10M`
    : `ISSF_AIR_${rifle ? 'RIFLE' : 'PISTOL'}_10M_2026`;
  const scoring = definition.laneProtocol?.acc ?? 'DECIMAL';
  if (competition.acc !== scoring) throw new Error('Source scoring mode does not match the standard definition');
  const rings = Array.from({ length: 10 }, (_, index) => ({
    score: 10 - index,
    diameter: rifle ? (beam ? 1 : 0.5) + index * 5 : 11.5 + index * 16,
  }));
  const target: VistaDefinition['target'] = {
    profileId,
    unit: 'mm',
    origin: 'center',
    xDirection: 'right',
    yDirection: 'up',
    rings,
    blackDiameter: rifle ? (beam ? 31 : 30.5) : 59.5,
    outerDiameter: rifle ? (beam ? 46 : 45.5) : 155.5,
    shotDiameter: beam && rifle ? 6 : 4.5,
  };
  return VistaDefinitionSchema.parse({
    id: definition.rulePackId ?? `saika-standard:${definition.id}`,
    fingerprint: vistaDigest({ definition, target }),
    eventCode: definition.id,
    name: definition.name,
    scoring,
    target,
    stages: definition.config.stages.map((stage) => ({
      name: stage.name,
      scored: stage.type === 'match',
      seriesShots: stage.series.map((series) => series.shots).filter((shots) => shots > 0),
    })),
  });
}
