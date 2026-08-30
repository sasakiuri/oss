// SPDX-License-Identifier: MIT
import type { CompetitionStartPhase, PhaseStartRequirement } from '@/shared/competitionTypes';

export interface PhaseStartConfirmation {
  readonly acknowledgedRequirementIds: readonly string[];
  readonly message: string;
}

/** Formats application-defined requirements without knowing their Rule Pack source. */
export function buildPhaseStartConfirmation(
  phase: CompetitionStartPhase,
  requirements: readonly PhaseStartRequirement[] | undefined,
): PhaseStartConfirmation | null {
  if (!requirements || requirements.length === 0) return null;

  const phaseLabel = phase === 'SIGHTING' ? 'Preparation and Sighting' : 'MATCH firing';
  const requirementLines = requirements.map(
    (requirement) => `- ${requirement.description}${formatRequirementTiming(requirement)}`,
  );
  return Object.freeze({
    acknowledgedRequirementIds: Object.freeze(requirements.map((requirement) => requirement.id)),
    message: `Before starting ${phaseLabel}, confirm all operational requirements:\n${requirementLines.join('\n')}`,
  });
}

function formatRequirementTiming(requirement: PhaseStartRequirement): string {
  if (!requirement.timing) return '';
  const duration = formatDuration(requirement.timing.durationSeconds);
  switch (requirement.timing.qualifier) {
    case 'REQUIRED':
      return ` Required allowance: ${duration}.`;
    case 'MINIMUM':
      return ` Minimum interval: ${duration}.`;
    case 'APPROXIMATE':
      return ` Rule guidance: approximately ${duration}.`;
  }
}

function formatDuration(seconds: number): string {
  return seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} sec`;
}
