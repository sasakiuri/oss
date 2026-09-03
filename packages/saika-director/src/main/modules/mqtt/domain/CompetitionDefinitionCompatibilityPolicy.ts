import type { RulePackIdentity } from '@sasakiuri/saika-rules';

export type CompetitionCompatibilityMode = 'DISABLED' | 'ADVISORY' | 'REQUIRED';

export interface CompetitionDefinitionRequirement {
  readonly protocolVersion: 1;
  readonly compatibilityMode: CompetitionCompatibilityMode;
  readonly rulePack?: RulePackIdentity;
}

export interface LaneCompetitionCapabilities {
  readonly competitionProtocolVersions: readonly number[];
  readonly rulePacks: readonly RulePackIdentity[];
}

export interface CompetitionCompatibilityAssessment {
  readonly status: 'DISABLED' | 'LEGACY' | 'MATCH' | 'UNAVAILABLE' | 'MISMATCH';
  readonly joinAllowed: boolean;
  readonly guidance: string;
}

/** Pure preflight policy; MQTT transport and UI decide how to present the result. */
export interface ICompetitionDefinitionCompatibilityPolicy {
  assess(
    requirement: CompetitionDefinitionRequirement | undefined,
    capabilities: LaneCompetitionCapabilities | undefined,
  ): CompetitionCompatibilityAssessment;
}

export class CompetitionDefinitionCompatibilityPolicy implements ICompetitionDefinitionCompatibilityPolicy {
  assess(
    requirement: CompetitionDefinitionRequirement | undefined,
    capabilities: LaneCompetitionCapabilities | undefined,
  ): CompetitionCompatibilityAssessment {
    if (!requirement) {
      return {
        status: 'LEGACY',
        joinAllowed: true,
        guidance: 'This competition has no exact definition binding.',
      };
    }
    if (requirement.compatibilityMode === 'DISABLED') {
      return {
        status: 'DISABLED',
        joinAllowed: true,
        guidance: 'Exact Rule Pack compatibility is disabled for this competition.',
      };
    }

    const required = requirement.compatibilityMode === 'REQUIRED';
    if (!capabilities || !capabilities.competitionProtocolVersions.includes(requirement.protocolVersion)) {
      return {
        status: 'UNAVAILABLE',
        joinAllowed: !required,
        guidance: `Lane does not advertise competition definition protocol ${requirement.protocolVersion}.`,
      };
    }
    if (!requirement.rulePack) {
      return {
        status: 'UNAVAILABLE',
        joinAllowed: !required,
        guidance: 'Director did not bind this competition to an exact Rule Pack.',
      };
    }

    const match = capabilities.rulePacks.find((candidate) => sameIdentity(candidate, requirement.rulePack!));
    if (match) {
      return {
        status: 'MATCH',
        joinAllowed: true,
        guidance: `Rule Pack ${match.id} matches exactly.`,
      };
    }

    const sameId = capabilities.rulePacks.find((candidate) => candidate.id === requirement.rulePack?.id);
    return {
      status: 'MISMATCH',
      joinAllowed: !required,
      guidance: sameId
        ? `Lane has a different fingerprint for Rule Pack ${requirement.rulePack.id}.`
        : `Lane does not advertise Rule Pack ${requirement.rulePack.id}.`,
    };
  }
}

function sameIdentity(left: RulePackIdentity, right: RulePackIdentity): boolean {
  return (
    left.id === right.id &&
    left.schemaVersion === right.schemaVersion &&
    left.fingerprint.algorithm === right.fingerprint.algorithm &&
    left.fingerprint.value === right.fingerprint.value
  );
}
