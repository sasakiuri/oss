import type { DirectorLaneSnapshotDto } from '@/shared/ipc/contracts';

/** `FP <n>`, else the Lane alias, else the first eight characters of the Lane id. */
export function firingPointLabel(lane: DirectorLaneSnapshotDto): string {
  return lane.firingPointNumber ? `FP ${lane.firingPointNumber}` : lane.laneAlias || lane.laneId.slice(0, 8);
}

/** The firing point label followed by the assigned athlete, when there is one. */
export function laneLabel(lane: DirectorLaneSnapshotDto): string {
  const point = firingPointLabel(lane);
  return lane.assignment?.athlete ? `${point} · ${lane.assignment.athlete.name}` : point;
}

/** `laneLabel` of the Lane with this id, else the first eight characters of the id. */
export function laneLabelById(lanes: readonly DirectorLaneSnapshotDto[], laneId: string): string {
  const lane = lanes.find((candidate) => candidate.laneId === laneId);
  return lane ? laneLabel(lane) : laneId.slice(0, 8);
}
