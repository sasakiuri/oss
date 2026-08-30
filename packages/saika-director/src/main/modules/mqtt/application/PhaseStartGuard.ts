// SPDX-License-Identifier: MIT
import type { CompetitionStartPhase, CompetitionTypeDefinition } from '@/shared/competitionTypes';

/**
 * Enforces application-owned readiness acknowledgements without coupling the
 * Rule Pack or Lane MQTT protocol to a particular confirmation UI.
 */
export function assertPhaseStartReady(
  definition: CompetitionTypeDefinition,
  phase: CompetitionStartPhase,
  acknowledgedRequirementIds: readonly string[] | undefined,
): void {
  const requirements = definition.phaseStartRequirements?.[phase] ?? [];
  if (requirements.length === 0) return;

  const acknowledgements = new Set(acknowledgedRequirementIds ?? []);
  const missingRequirementIds = requirements
    .map((requirement) => requirement.id)
    .filter((id) => !acknowledgements.has(id));
  if (missingRequirementIds.length === 0) return;

  throw new Error(
    `Competition type ${definition.id} requires ${phase} start acknowledgement(s): ${missingRequirementIds.join(', ')}`,
  );
}
