import type { RelayReadinessEntry, RelayReadinessPhase, RelayReadinessRequirement } from './RelayReadinessEntry';

export const RELAY_READINESS_MODES = ['DISABLED', 'ADVISORY', 'REQUIRED'] as const;
export type RelayReadinessMode = (typeof RELAY_READINESS_MODES)[number];

export interface RelayReadinessAssessmentItem {
  requirement: RelayReadinessRequirement;
  laneId: string | null;
  ruleReference: string;
  confirmed: boolean;
  latestEntry: RelayReadinessEntry | null;
}

export interface RelayReadinessAssessment {
  mode: RelayReadinessMode;
  ready: boolean;
  mayStart: boolean;
  items: RelayReadinessAssessmentItem[];
}

/** Replaceable policy boundary; it does not know about SQLite, IPC, or MQTT. */
export interface IRelayReadinessPolicy {
  assess(input: {
    phase: RelayReadinessPhase;
    laneIds: readonly string[];
    entries: readonly RelayReadinessEntry[];
  }): RelayReadinessAssessment;
}

export class IssfRelayReadinessPolicy implements IRelayReadinessPolicy {
  constructor(readonly mode: RelayReadinessMode = 'ADVISORY') {}

  assess(input: {
    phase: RelayReadinessPhase;
    laneIds: readonly string[];
    entries: readonly RelayReadinessEntry[];
  }): RelayReadinessAssessment {
    if (this.mode === 'DISABLED') return { mode: this.mode, ready: true, mayStart: true, items: [] };

    const requiredKeys: Array<{
      requirement: RelayReadinessRequirement;
      laneId: string | null;
      ruleReference: string;
    }> = [
      { requirement: 'RANGE_EQUIPMENT_READY', laneId: null, ruleReference: 'ISSF 6.10.3.2' },
      { requirement: 'BACKUP_MEMORY_READY', laneId: null, ruleReference: 'ISSF 6.14.8' },
      ...[...new Set(input.laneIds.map(normalizedLaneId))].map((laneId) => ({
        requirement: 'TARGET_MODE_CONFIRMED' as const,
        laneId,
        ruleReference: input.phase === 'SIGHTING' ? 'ISSF 6.11.1.1' : 'ISSF 6.11.1.2',
      })),
    ];
    const items = requiredKeys.map((required) => {
      const latestEntry =
        input.entries
          .filter((entry) => entry.requirement === required.requirement && entry.laneId === required.laneId)
          .at(-1) ?? null;
      return { ...required, confirmed: latestEntry?.state === 'CONFIRMED', latestEntry };
    });
    const ready = items.every((item) => item.confirmed);
    return { mode: this.mode, ready, mayStart: this.mode !== 'REQUIRED' || ready, items };
  }
}

function normalizedLaneId(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error('laneIds cannot contain an empty value');
  return normalized;
}
