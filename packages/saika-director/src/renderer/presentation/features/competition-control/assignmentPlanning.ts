// SPDX-License-Identifier: MIT
import type { DirectorLaneSnapshotDto, FiringPointAssignmentDto, ParticipantDto } from '@/shared/ipc/contracts';
import type { Athlete } from '@/shared/mqtt';

export interface PlannedFiringPointAssignment {
  firingPointNumber: number;
  laneId: string;
  laneAlias: string;
  athlete: Athlete;
}

export interface FiringPointAssignmentPlan {
  relayNumber: number;
  totalAssignments: number;
  assignments: PlannedFiringPointAssignment[];
  missingLaneFiringPointNumbers: number[];
  ambiguousLaneFiringPointNumbers: number[];
  duplicateAssignmentFiringPointNumbers: number[];
  missingParticipantIds: string[];
}

export interface FiringPointAssignmentApplicationResult {
  succeeded: number;
  skipped: number;
  failedFiringPointNumbers: number[];
}

interface BuildFiringPointAssignmentPlanInput {
  relayNumber: number;
  assignments: FiringPointAssignmentDto[];
  participants: ParticipantDto[];
  lanes: DirectorLaneSnapshotDto[];
}

interface ApplyFiringPointAssignmentPlanInput {
  competitionId: string;
  plan: FiringPointAssignmentPlan;
  assignAthlete: (input: {
    competitionId: string;
    laneId: string;
    athlete: Athlete;
  }) => Promise<{ success: true; data: { success: boolean } } | { success: false }>;
}

function sortedUnique(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

export function buildFiringPointAssignmentPlan({
  relayNumber,
  assignments,
  participants,
  lanes,
}: BuildFiringPointAssignmentPlanInput): FiringPointAssignmentPlan {
  const relayAssignments = assignments.filter((assignment) => assignment.relayNumber === relayNumber);
  const assignmentsByFiringPoint = new Map<number, FiringPointAssignmentDto[]>();
  for (const assignment of relayAssignments) {
    const existing = assignmentsByFiringPoint.get(assignment.firingPointNumber) ?? [];
    existing.push(assignment);
    assignmentsByFiringPoint.set(assignment.firingPointNumber, existing);
  }

  const lanesByFiringPoint = new Map<number, DirectorLaneSnapshotDto[]>();
  for (const lane of lanes) {
    if (lane.firingPointNumber === null) continue;
    const existing = lanesByFiringPoint.get(lane.firingPointNumber) ?? [];
    existing.push(lane);
    lanesByFiringPoint.set(lane.firingPointNumber, existing);
  }

  const participantsById = new Map(participants.map((participant) => [participant.id, participant]));
  const participantFallbackStartNumbers = new Map(
    participants.map((participant, index) => [participant.id, index + 1]),
  );
  const plannedAssignments: PlannedFiringPointAssignment[] = [];
  const missingLaneFiringPointNumbers: number[] = [];
  const ambiguousLaneFiringPointNumbers: number[] = [];
  const duplicateAssignmentFiringPointNumbers: number[] = [];
  const missingParticipantIds: string[] = [];

  for (const [firingPointNumber, firingPointAssignments] of assignmentsByFiringPoint) {
    if (firingPointAssignments.length !== 1) {
      duplicateAssignmentFiringPointNumbers.push(firingPointNumber);
      continue;
    }

    const assignment = firingPointAssignments[0]!;
    const participant = participantsById.get(assignment.participantId);
    if (!participant) {
      missingParticipantIds.push(assignment.participantId);
      continue;
    }

    const matchingLanes = lanesByFiringPoint.get(firingPointNumber) ?? [];
    if (matchingLanes.length === 0) {
      missingLaneFiringPointNumbers.push(firingPointNumber);
      continue;
    }
    if (matchingLanes.length !== 1) {
      ambiguousLaneFiringPointNumbers.push(firingPointNumber);
      continue;
    }

    const lane = matchingLanes[0]!;
    const startNumber =
      Number.isInteger(participant.sortOrder) && participant.sortOrder >= 0
        ? participant.sortOrder + 1
        : (participantFallbackStartNumbers.get(participant.id) ?? 1);
    plannedAssignments.push({
      firingPointNumber,
      laneId: lane.laneId,
      laneAlias: lane.laneAlias,
      athlete: {
        id: participant.id,
        startNumber,
        name: participant.playerName,
        ...(participant.affiliation.trim() ? { teamName: participant.affiliation.trim() } : {}),
      },
    });
  }

  return {
    relayNumber,
    totalAssignments: relayAssignments.length,
    assignments: plannedAssignments.sort((a, b) => a.firingPointNumber - b.firingPointNumber),
    missingLaneFiringPointNumbers: sortedUnique(missingLaneFiringPointNumbers),
    ambiguousLaneFiringPointNumbers: sortedUnique(ambiguousLaneFiringPointNumbers),
    duplicateAssignmentFiringPointNumbers: sortedUnique(duplicateAssignmentFiringPointNumbers),
    missingParticipantIds: [...new Set(missingParticipantIds)],
  };
}

export async function applyFiringPointAssignmentPlan({
  competitionId,
  plan,
  assignAthlete,
}: ApplyFiringPointAssignmentPlanInput): Promise<FiringPointAssignmentApplicationResult> {
  const outcomes = await Promise.allSettled(
    plan.assignments.map((assignment) =>
      assignAthlete({
        competitionId,
        laneId: assignment.laneId,
        athlete: assignment.athlete,
      }),
    ),
  );
  const failedFiringPointNumbers: number[] = [];
  let succeeded = 0;
  outcomes.forEach((outcome, index) => {
    if (outcome.status === 'fulfilled' && outcome.value.success && outcome.value.data.success) {
      succeeded += 1;
      return;
    }
    const firingPointNumber = plan.assignments[index]?.firingPointNumber;
    if (firingPointNumber !== undefined) failedFiringPointNumbers.push(firingPointNumber);
  });

  return {
    succeeded,
    skipped: plan.totalAssignments - plan.assignments.length,
    failedFiringPointNumbers,
  };
}
