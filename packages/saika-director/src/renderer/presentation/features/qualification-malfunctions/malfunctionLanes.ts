import type { DirectorLaneSnapshotDto } from '@/shared/ipc/contracts';

/** A Lane whose assigned athlete is a registered participant of the competition. */
export interface EligibleLane {
  readonly value: DirectorLaneSnapshotDto;
  readonly participantId: string;
  readonly athleteLabel: string;
  readonly laneChannel: number | null;
}

type LaneMalfunctionSignal = NonNullable<DirectorLaneSnapshotDto['qualificationMalfunctionSignal']>;
type LaneMalfunctionSignalContext = NonNullable<LaneMalfunctionSignal['context']>;

/** A malfunction a Lane declared for its assigned athlete, with the complete firing context it reported. */
export interface LaneDeclaration {
  readonly lane: EligibleLane & { readonly laneChannel: number };
  readonly signal: LaneMalfunctionSignal & {
    readonly signalId: string;
    readonly context: LaneMalfunctionSignalContext;
    readonly signalledAt: string;
  };
}

/** The Lane as an eligible Lane when it is assigned to the competition with a registered (UUID) participant. */
export function toEligibleLane(lane: DirectorLaneSnapshotDto, competitionId: string): EligibleLane[] {
  const athlete = lane.assignment?.athlete;
  if (!athlete || lane.assignment?.competitionId !== competitionId || !isUuid(athlete.id)) return [];
  return [
    {
      value: lane,
      participantId: athlete.id,
      athleteLabel: `${athlete.startNumber} · ${athlete.name}`,
      laneChannel: lane.firingPointNumber,
    },
  ];
}

/** The Lane's declaration when it is complete and belongs to this competition and the assigned participant. */
export function toLaneDeclaration(lane: EligibleLane, competitionId: string): LaneDeclaration[] {
  const signal = lane.value.qualificationMalfunctionSignal;
  if (
    lane.laneChannel === null ||
    !signal?.signalId ||
    !signal.context ||
    !signal.signalledAt ||
    signal.laneId !== lane.value.laneId ||
    signal.context.competitionId !== competitionId ||
    signal.context.participantId !== lane.participantId
  ) {
    return [];
  }
  return [
    {
      lane: { ...lane, laneChannel: lane.laneChannel },
      signal: { ...signal, signalId: signal.signalId, context: signal.context, signalledAt: signal.signalledAt },
    },
  ];
}

/**
 * The timed exposure and Lane session recorded with a new case: those the Lane declared, else the Lane's current
 * exposure when it is in the entered stage and series of the competition, and its session of the competition.
 */
export function caseFiringContext(
  lane: EligibleLane,
  signal: LaneDeclaration['signal'] | null,
  competitionId: string,
  stageIndex: number,
  seriesIndex: number,
) {
  const laneState = lane.value.competitionState;
  const timedState = lane.value.timedTargetState;
  const exposureIndex = signal
    ? signal.context.exposureIndex
    : timedState?.competitionId === competitionId &&
        timedState.stageIndex === stageIndex &&
        timedState.seriesIndex === seriesIndex
      ? timedState.exposureIndex
      : null;
  const laneSessionId = signal
    ? signal.context.sessionId
    : laneState?.competitionId === competitionId
      ? laneState.sessionId
      : null;
  return { exposureIndex, laneSessionId };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
