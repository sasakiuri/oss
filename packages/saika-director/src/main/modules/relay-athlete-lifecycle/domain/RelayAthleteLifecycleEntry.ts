export const RELAY_ATHLETE_LIFECYCLE_PHASES = ['PRE_RELAY', 'POST_RELAY'] as const;
export const RELAY_ATHLETE_LIFECYCLE_REQUIREMENTS = [
  'ATHLETE_IDENTITY_BIB_VERIFIED',
  'EQUIPMENT_APPROVAL_VERIFIED',
  'FIREARM_UNLOADED_SAFETY_FLAG_VERIFIED',
  'PRINTOUT_ATHLETE_SIGNED',
  'PRINTOUT_OFFICIAL_INITIALLED',
  'ATHLETE_RELEASED',
] as const;
export const RELAY_ATHLETE_LIFECYCLE_STATES = ['CONFIRMED', 'REVOKED'] as const;
export const RELAY_ATHLETE_LIFECYCLE_SOURCES = ['MANUAL', 'LANE_REPORTED', 'IMPORT'] as const;

export type RelayAthleteLifecyclePhase = (typeof RELAY_ATHLETE_LIFECYCLE_PHASES)[number];
export type RelayAthleteLifecycleRequirement = (typeof RELAY_ATHLETE_LIFECYCLE_REQUIREMENTS)[number];
export type RelayAthleteLifecycleState = (typeof RELAY_ATHLETE_LIFECYCLE_STATES)[number];
export type RelayAthleteLifecycleSource = (typeof RELAY_ATHLETE_LIFECYCLE_SOURCES)[number];

export interface RelayAthleteLifecycleEntryProps {
  id?: string;
  competitionId: string;
  relayNumber: number;
  laneId: string;
  athleteId: string;
  athleteName: string;
  athleteStartNumber: number;
  phase: RelayAthleteLifecyclePhase;
  requirement: RelayAthleteLifecycleRequirement;
  state: RelayAthleteLifecycleState;
  source: RelayAthleteLifecycleSource;
  statement: string;
  officialName: string;
  recordedAt?: Date;
}

/** Append-only evidence for a single athlete at a firing point. */
export class RelayAthleteLifecycleEntry {
  private constructor(
    readonly id: string,
    readonly competitionId: string,
    readonly relayNumber: number,
    readonly laneId: string,
    readonly athleteId: string,
    readonly athleteName: string,
    readonly athleteStartNumber: number,
    readonly phase: RelayAthleteLifecyclePhase,
    readonly requirement: RelayAthleteLifecycleRequirement,
    readonly state: RelayAthleteLifecycleState,
    readonly source: RelayAthleteLifecycleSource,
    readonly statement: string,
    readonly officialName: string,
    readonly recordedAt: Date,
  ) {
    Object.freeze(this);
  }

  static create(props: RelayAthleteLifecycleEntryProps): RelayAthleteLifecycleEntry {
    if (!Number.isInteger(props.relayNumber) || props.relayNumber < 1) {
      throw new Error('relayNumber must be a positive integer');
    }
    if (!Number.isInteger(props.athleteStartNumber) || props.athleteStartNumber < 1) {
      throw new Error('athleteStartNumber must be a positive integer');
    }
    if (!RELAY_ATHLETE_LIFECYCLE_PHASES.includes(props.phase)) throw new Error('phase is invalid');
    if (!RELAY_ATHLETE_LIFECYCLE_REQUIREMENTS.includes(props.requirement)) throw new Error('requirement is invalid');
    if (!RELAY_ATHLETE_LIFECYCLE_STATES.includes(props.state)) throw new Error('state is invalid');
    if (!RELAY_ATHLETE_LIFECYCLE_SOURCES.includes(props.source)) throw new Error('source is invalid');
    if (phaseForRequirement(props.requirement) !== props.phase) {
      throw new Error(`${props.requirement} must use ${phaseForRequirement(props.requirement)}`);
    }
    const recordedAt = props.recordedAt ?? new Date();
    if (!Number.isFinite(recordedAt.getTime())) throw new Error('recordedAt must be valid');

    return new RelayAthleteLifecycleEntry(
      props.id ? requiredText(props.id, 'id') : crypto.randomUUID(),
      requiredText(props.competitionId, 'competitionId'),
      props.relayNumber,
      requiredText(props.laneId, 'laneId'),
      requiredText(props.athleteId, 'athleteId'),
      requiredText(props.athleteName, 'athleteName'),
      props.athleteStartNumber,
      props.phase,
      props.requirement,
      props.state,
      props.source,
      requiredText(props.statement, 'statement'),
      requiredText(props.officialName, 'officialName'),
      new Date(recordedAt.getTime()),
    );
  }

  static reconstruct(props: Required<Omit<RelayAthleteLifecycleEntryProps, 'recordedAt'>> & { recordedAt: Date }) {
    return RelayAthleteLifecycleEntry.create(props);
  }
}

export function phaseForRequirement(requirement: RelayAthleteLifecycleRequirement): RelayAthleteLifecyclePhase {
  return requirement === 'ATHLETE_IDENTITY_BIB_VERIFIED' || requirement === 'EQUIPMENT_APPROVAL_VERIFIED'
    ? 'PRE_RELAY'
    : 'POST_RELAY';
}

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}
