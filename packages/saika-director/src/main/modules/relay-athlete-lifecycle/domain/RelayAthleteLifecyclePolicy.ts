import type {
  RelayAthleteLifecycleEntry,
  RelayAthleteLifecyclePhase,
  RelayAthleteLifecycleRequirement,
} from './RelayAthleteLifecycleEntry';

export const RELAY_ATHLETE_LIFECYCLE_MODES = ['DISABLED', 'ADVISORY', 'REQUIRED'] as const;
export type RelayAthleteLifecycleMode = (typeof RELAY_ATHLETE_LIFECYCLE_MODES)[number];

export interface RelayAthleteIdentity {
  laneId: string;
  athleteId: string;
  athleteName: string;
  athleteStartNumber: number;
}

export interface RelayAthleteLifecycleAssessmentItem {
  requirement: RelayAthleteLifecycleRequirement;
  laneId: string;
  athleteId: string;
  phase: RelayAthleteLifecyclePhase;
  label: string;
  ruleReference: string;
  required: boolean;
  alternativeGroup: string | null;
  confirmed: boolean;
  latestEntry: RelayAthleteLifecycleEntry | null;
}

export interface RelayAthleteLifecycleAssessment {
  mode: RelayAthleteLifecycleMode;
  ready: boolean;
  mayProceed: boolean;
  items: RelayAthleteLifecycleAssessmentItem[];
}

export interface RelayAthleteLifecycleRequirementDefinition {
  readonly requirement: RelayAthleteLifecycleRequirement;
  readonly label: string;
  readonly ruleReference: string;
  readonly required: boolean;
  readonly alternativeGroup?: string;
}

/** Replaceable rules profile, independent from storage and transport. */
export interface IRelayAthleteLifecycleProfile {
  definitions(phase: RelayAthleteLifecyclePhase): readonly RelayAthleteLifecycleRequirementDefinition[];
}

export interface IRelayAthleteLifecyclePolicy {
  assess(input: {
    phase: RelayAthleteLifecyclePhase;
    athletes: readonly RelayAthleteIdentity[];
    entries: readonly RelayAthleteLifecycleEntry[];
  }): RelayAthleteLifecycleAssessment;
}

export class Issf2026RelayAthleteLifecycleProfile implements IRelayAthleteLifecycleProfile {
  definitions(phase: RelayAthleteLifecyclePhase): readonly RelayAthleteLifecycleRequirementDefinition[] {
    if (phase === 'PRE_RELAY') {
      return [
        {
          requirement: 'ATHLETE_IDENTITY_BIB_VERIFIED',
          label: 'Athlete name and Bib agree with the start list',
          ruleReference: 'ISSF 6.9.2(b)',
          required: true,
        },
        {
          requirement: 'EQUIPMENT_APPROVAL_VERIFIED',
          label: 'Firearm, equipment and accessories have been examined and approved',
          ruleReference: 'ISSF 6.9.2(c), 6.7.6',
          required: true,
        },
      ];
    }
    return [
      {
        requirement: 'FIREARM_UNLOADED_SAFETY_FLAG_VERIFIED',
        label: 'Firearm is unloaded with action open and safety flag inserted',
        ruleReference: 'ISSF 6.2.2.4',
        required: true,
      },
      {
        requirement: 'PRINTOUT_ATHLETE_SIGNED',
        label: 'Athlete signed the score printout',
        ruleReference: 'ISSF 6.10.4(f)',
        required: false,
        alternativeGroup: 'PRINTOUT_IDENTIFIED',
      },
      {
        requirement: 'PRINTOUT_OFFICIAL_INITIALLED',
        label: 'Jury or range official initialled the printout',
        ruleReference: 'ISSF 6.10.4(g)',
        required: false,
        alternativeGroup: 'PRINTOUT_IDENTIFIED',
      },
      {
        requirement: 'ATHLETE_RELEASED',
        label: 'Athlete released from the firing point',
        ruleReference: 'ISSF 6.2.2.4, 6.10.4(f-g)',
        required: true,
      },
    ];
  }
}

export class IssfRelayAthleteLifecyclePolicy implements IRelayAthleteLifecyclePolicy {
  constructor(
    readonly mode: RelayAthleteLifecycleMode = 'ADVISORY',
    private readonly profile: IRelayAthleteLifecycleProfile = new Issf2026RelayAthleteLifecycleProfile(),
  ) {}

  assess(input: {
    phase: RelayAthleteLifecyclePhase;
    athletes: readonly RelayAthleteIdentity[];
    entries: readonly RelayAthleteLifecycleEntry[];
  }): RelayAthleteLifecycleAssessment {
    if (this.mode === 'DISABLED') return { mode: this.mode, ready: true, mayProceed: true, items: [] };

    const athletes = uniqueAthletes(input.athletes);
    const definitions = this.profile.definitions(input.phase);
    const items = athletes.flatMap((athlete) =>
      definitions.map((definition): RelayAthleteLifecycleAssessmentItem => {
        const latestEntry =
          input.entries
            .filter(
              (entry) =>
                entry.phase === input.phase &&
                entry.requirement === definition.requirement &&
                entry.laneId === athlete.laneId &&
                entry.athleteId === athlete.athleteId,
            )
            .at(-1) ?? null;
        return {
          ...definition,
          alternativeGroup: definition.alternativeGroup ?? null,
          laneId: athlete.laneId,
          athleteId: athlete.athleteId,
          phase: input.phase,
          confirmed: latestEntry?.state === 'CONFIRMED',
          latestEntry,
        };
      }),
    );

    const ready = athletes.every((athlete) => athleteReady(input.phase, athlete, items));
    return { mode: this.mode, ready, mayProceed: this.mode !== 'REQUIRED' || ready, items };
  }
}

/** Prerequisites for recording ATHLETE_RELEASED; release itself is deliberately excluded. */
export function athleteMayBeReleased(
  items: readonly RelayAthleteLifecycleAssessmentItem[],
  athleteId: string,
): boolean {
  const athleteItems = items.filter((item) => item.athleteId === athleteId);
  return (
    athleteItems.some((item) => item.requirement === 'FIREARM_UNLOADED_SAFETY_FLAG_VERIFIED' && item.confirmed) &&
    athleteItems.some((item) => item.alternativeGroup === 'PRINTOUT_IDENTIFIED' && item.confirmed)
  );
}

function athleteReady(
  phase: RelayAthleteLifecyclePhase,
  athlete: RelayAthleteIdentity,
  items: readonly RelayAthleteLifecycleAssessmentItem[],
): boolean {
  const athleteItems = items.filter((item) => item.athleteId === athlete.athleteId && item.laneId === athlete.laneId);
  if (phase === 'PRE_RELAY') return athleteItems.filter((item) => item.required).every((item) => item.confirmed);
  return (
    athleteMayBeReleased(athleteItems, athlete.athleteId) &&
    athleteItems.some((item) => item.requirement === 'ATHLETE_RELEASED' && item.confirmed)
  );
}

function uniqueAthletes(athletes: readonly RelayAthleteIdentity[]): RelayAthleteIdentity[] {
  const seen = new Set<string>();
  return athletes.map(normalizeAthlete).filter((athlete) => {
    const key = `${athlete.laneId}\u0000${athlete.athleteId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeAthlete(athlete: RelayAthleteIdentity): RelayAthleteIdentity {
  const laneId = athlete.laneId.trim();
  const athleteId = athlete.athleteId.trim();
  const athleteName = athlete.athleteName.trim();
  if (!laneId || !athleteId || !athleteName) throw new Error('athlete identity fields are required');
  if (!Number.isInteger(athlete.athleteStartNumber) || athlete.athleteStartNumber < 1) {
    throw new Error('athleteStartNumber must be a positive integer');
  }
  return { ...athlete, laneId, athleteId, athleteName };
}
