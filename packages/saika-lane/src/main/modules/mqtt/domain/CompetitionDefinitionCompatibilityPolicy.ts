import type { RulePackIdentity } from '@sasakiuri/saika-rules';

import type { CompetitionStatePayload } from './MqttCompetitionStateSchemas';

export interface LocalCompetitionDefinitionIdentity {
  readonly id: string;
  readonly rulePackIdentity?: RulePackIdentity;
}

export interface CompetitionDefinitionCompatibilityAssessment {
  readonly status: 'DISABLED' | 'LEGACY' | 'MATCH' | 'UNKNOWN_RULE_PACK' | 'MISMATCH';
  readonly joinAllowed: boolean;
  readonly guidance: string;
}

/** Pure policy: transport subscription and competition creation remain separate concerns. */
export class CompetitionDefinitionCompatibilityPolicy {
  assess(
    state: Pick<CompetitionStatePayload, 'competitionTypeId' | 'definitionBinding'>,
    localDefinition: LocalCompetitionDefinitionIdentity | undefined,
  ): CompetitionDefinitionCompatibilityAssessment {
    const binding = state.definitionBinding;
    if (!binding) {
      return {
        status: 'LEGACY',
        joinAllowed: true,
        guidance: 'Director did not publish a definition binding; structural compatibility checks still apply.',
      };
    }
    if (binding.compatibilityMode === 'DISABLED') {
      return {
        status: 'DISABLED',
        joinAllowed: true,
        guidance: 'Exact Rule Pack compatibility is disabled for this competition.',
      };
    }

    const required = binding.compatibilityMode === 'REQUIRED';
    if (!binding.rulePack || !localDefinition?.rulePackIdentity) {
      return {
        status: 'UNKNOWN_RULE_PACK',
        joinAllowed: !required,
        guidance: localDefinition
          ? 'The local competition definition has no exact Rule Pack identity.'
          : `Competition type ${state.competitionTypeId} is not available locally.`,
      };
    }

    const expected = binding.rulePack;
    const actual = localDefinition.rulePackIdentity;
    const matches =
      expected.id === actual.id &&
      expected.schemaVersion === actual.schemaVersion &&
      expected.fingerprint.algorithm === actual.fingerprint.algorithm &&
      expected.fingerprint.value === actual.fingerprint.value;
    return matches
      ? { status: 'MATCH', joinAllowed: true, guidance: `Rule Pack ${expected.id} matches exactly.` }
      : {
          status: 'MISMATCH',
          joinAllowed: !required,
          guidance: `Director requires ${format(expected)} but this Lane provides ${format(actual)}.`,
        };
  }
}

function format(identity: RulePackIdentity): string {
  return `${identity.id} schema ${identity.schemaVersion} SHA-256 ${identity.fingerprint.value.slice(0, 12)}…`;
}
