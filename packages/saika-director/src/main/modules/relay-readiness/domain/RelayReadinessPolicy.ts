import type {
  RelayReadinessEntry,
  RelayReadinessOperationalPhase,
  RelayReadinessPhase,
  RelayReadinessRequirement,
} from './RelayReadinessEntry';

export const RELAY_READINESS_MODES = ['DISABLED', 'ADVISORY', 'REQUIRED'] as const;
export type RelayReadinessMode = (typeof RELAY_READINESS_MODES)[number];

export interface RelayReadinessAssessmentItem {
  requirement: RelayReadinessRequirement;
  laneId: string | null;
  phase: RelayReadinessPhase;
  label: string;
  ruleReference: string;
  required: boolean;
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
    phase: RelayReadinessOperationalPhase;
    laneIds: readonly string[];
    entries: readonly RelayReadinessEntry[];
  }): RelayReadinessAssessment;
}

export interface RelayReadinessRequirementDefinition {
  readonly requirement: RelayReadinessRequirement;
  readonly phase: 'RELAY' | 'CURRENT';
  readonly scope: 'RELAY' | 'LANE';
  readonly label: string;
  readonly ruleReference: string;
  readonly required: boolean;
}

/** Replaceable checklist profile for ISSF, national, or local event operation. */
export interface IRelayReadinessChecklist {
  definitions(phase: RelayReadinessOperationalPhase): readonly RelayReadinessRequirementDefinition[];
}

export class Issf2026EstRelayChecklist implements IRelayReadinessChecklist {
  definitions(phase: RelayReadinessOperationalPhase): readonly RelayReadinessRequirementDefinition[] {
    return [
      {
        requirement: 'BACKUP_MEMORY_READY',
        phase: 'RELAY',
        scope: 'RELAY',
        label: 'Independent EST backup-memory printout is immediately available',
        ruleReference: 'ISSF 6.3.2.7',
        required: true,
      },
      {
        requirement: 'TARGET_WHITE_SURFACE_CLEAR',
        phase: 'RELAY',
        scope: 'LANE',
        label: 'No shot holes on the white target surface',
        ruleReference: 'ISSF 6.10.3.2(a)',
        required: true,
      },
      {
        requirement: 'TARGET_FRAME_MARKS_INDICATED',
        phase: 'RELAY',
        scope: 'LANE',
        label: 'Existing target-frame shot marks are clearly indicated',
        ruleReference: 'ISSF 6.10.3.2(b)',
        required: true,
      },
      {
        requirement: 'CONTROL_SHEET_RENEWED',
        phase: 'RELAY',
        scope: 'LANE',
        label: 'Control Sheet is renewed',
        ruleReference: 'ISSF 6.10.3.2(c)',
        required: true,
      },
      {
        requirement: 'BACKING_MATERIAL_CLEAR',
        phase: 'RELAY',
        scope: 'LANE',
        label: 'Backing Card and Backing Target are clear outside the Control Sheet area',
        ruleReference: 'ISSF 6.10.3.2(d)',
        required: true,
      },
      {
        requirement: 'TARGET_MODE_CONFIRMED',
        phase: 'CURRENT',
        scope: 'LANE',
        label: `${phase === 'SIGHTING' ? 'Sighting' : 'Match'} target mode is confirmed`,
        ruleReference: 'ISSF 6.10.4(b)',
        required: true,
      },
    ];
  }
}

export class IssfRelayReadinessPolicy implements IRelayReadinessPolicy {
  constructor(
    readonly mode: RelayReadinessMode = 'ADVISORY',
    private readonly checklist: IRelayReadinessChecklist = new Issf2026EstRelayChecklist(),
  ) {}

  assess(input: {
    phase: RelayReadinessOperationalPhase;
    laneIds: readonly string[];
    entries: readonly RelayReadinessEntry[];
  }): RelayReadinessAssessment {
    if (this.mode === 'DISABLED') return { mode: this.mode, ready: true, mayStart: true, items: [] };

    const laneIds = [...new Set(input.laneIds.map(normalizedLaneId))];
    const requiredKeys: Array<
      Omit<RelayReadinessRequirementDefinition, 'phase'> & {
        phase: RelayReadinessPhase;
        laneId: string | null;
      }
    > = [];
    for (const definition of this.checklist.definitions(input.phase)) {
      const phase: RelayReadinessPhase = definition.phase === 'RELAY' ? 'RELAY' : input.phase;
      if (definition.scope === 'RELAY') requiredKeys.push({ ...definition, phase, laneId: null });
      else for (const laneId of laneIds) requiredKeys.push({ ...definition, phase, laneId });
    }
    const items = requiredKeys.map((required) => {
      const latestEntry =
        input.entries
          .filter(
            (entry) =>
              entry.requirement === required.requirement &&
              (required.requirement === 'TARGET_MODE_CONFIRMED' || entry.phase === required.phase) &&
              entry.laneId === required.laneId,
          )
          .at(-1) ?? null;
      return {
        ...required,
        confirmed: latestEntry?.state === 'CONFIRMED' && latestEntry.phase === required.phase,
        latestEntry,
      };
    });
    const ready = items.filter((item) => item.required).every((item) => item.confirmed);
    return { mode: this.mode, ready, mayStart: this.mode !== 'REQUIRED' || ready, items };
  }
}

function normalizedLaneId(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error('laneIds cannot contain an empty value');
  return normalized;
}
