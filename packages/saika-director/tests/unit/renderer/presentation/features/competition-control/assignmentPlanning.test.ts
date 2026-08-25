// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';

import {
  applyFiringPointAssignmentPlan,
  buildFiringPointAssignmentPlan,
  type FiringPointAssignmentPlan,
} from '@/renderer/presentation/features/competition-control/assignmentPlanning';
import type { DirectorLaneSnapshotDto, FiringPointAssignmentDto, ParticipantDto } from '@/shared/ipc/contracts';

function lane(laneId: string, firingPointNumber: number | null, laneAlias = ''): DirectorLaneSnapshotDto {
  return {
    laneId,
    laneAlias,
    firingPointNumber,
    hardware: null,
    competitionState: null,
    assignment: null,
    score: null,
    lastRawShot: null,
    lastCompetitionShot: null,
    lastSeenAt: '2026-08-26T00:00:00.000Z',
  };
}

function participant(id: string, sortOrder: number, affiliation = ''): ParticipantDto {
  return {
    id,
    playerName: `Athlete ${id}`,
    affiliation,
    logoPath: null,
    sortOrder,
  };
}

function assignment(
  id: string,
  relayNumber: number,
  firingPointNumber: number,
  participantId: string,
): FiringPointAssignmentDto {
  return { id, relayNumber, firingPointNumber, participantId };
}

describe('buildFiringPointAssignmentPlan', () => {
  it('maps relay and firing-point assignments to Lanes and athlete data', () => {
    const plan = buildFiringPointAssignmentPlan({
      relayNumber: 2,
      assignments: [
        assignment('a-3', 2, 3, 'p-3'),
        assignment('a-1', 2, 1, 'p-1'),
        assignment('other-relay', 1, 2, 'p-2'),
      ],
      participants: [participant('p-1', 4, 'Tokyo'), participant('p-2', 1), participant('p-3', 7)],
      lanes: [lane('lane-3', 3, 'Lane 3'), lane('lane-1', 1, 'Lane 1')],
    });

    expect(plan.totalAssignments).toBe(2);
    expect(plan.assignments).toEqual([
      {
        firingPointNumber: 1,
        laneId: 'lane-1',
        laneAlias: 'Lane 1',
        athlete: { id: 'p-1', startNumber: 5, name: 'Athlete p-1', teamName: 'Tokyo' },
      },
      {
        firingPointNumber: 3,
        laneId: 'lane-3',
        laneAlias: 'Lane 3',
        athlete: { id: 'p-3', startNumber: 8, name: 'Athlete p-3' },
      },
    ]);
    expect(plan.missingLaneFiringPointNumbers).toEqual([]);
  });

  it('excludes assignments whose Lane or participant is missing', () => {
    const plan = buildFiringPointAssignmentPlan({
      relayNumber: 1,
      assignments: [assignment('a-1', 1, 1, 'p-missing'), assignment('a-2', 1, 2, 'p-2')],
      participants: [participant('p-2', 0)],
      lanes: [lane('lane-1', 1)],
    });

    expect(plan.assignments).toEqual([]);
    expect(plan.missingParticipantIds).toEqual(['p-missing']);
    expect(plan.missingLaneFiringPointNumbers).toEqual([2]);
  });

  it('excludes duplicate assignments and Lanes as ambiguous mappings', () => {
    const plan = buildFiringPointAssignmentPlan({
      relayNumber: 1,
      assignments: [
        assignment('a-1', 1, 1, 'p-1'),
        assignment('a-1-duplicate', 1, 1, 'p-2'),
        assignment('a-2', 1, 2, 'p-2'),
      ],
      participants: [participant('p-1', 0), participant('p-2', 1)],
      lanes: [lane('lane-1', 1), lane('lane-2a', 2), lane('lane-2b', 2)],
    });

    expect(plan.assignments).toEqual([]);
    expect(plan.duplicateAssignmentFiringPointNumbers).toEqual([1]);
    expect(plan.ambiguousLaneFiringPointNumbers).toEqual([2]);
  });
});

describe('applyFiringPointAssignmentPlan', () => {
  it('sends to multiple Lanes in parallel and summarizes failures, exceptions, and skipped assignments', async () => {
    const plan: FiringPointAssignmentPlan = {
      relayNumber: 1,
      totalAssignments: 4,
      assignments: [
        {
          firingPointNumber: 1,
          laneId: 'lane-1',
          laneAlias: '1',
          athlete: { id: 'p-1', startNumber: 1, name: 'Athlete 1' },
        },
        {
          firingPointNumber: 2,
          laneId: 'lane-2',
          laneAlias: '2',
          athlete: { id: 'p-2', startNumber: 2, name: 'Athlete 2' },
        },
        {
          firingPointNumber: 3,
          laneId: 'lane-3',
          laneAlias: '3',
          athlete: { id: 'p-3', startNumber: 3, name: 'Athlete 3' },
        },
      ],
      missingLaneFiringPointNumbers: [4],
      ambiguousLaneFiringPointNumbers: [],
      duplicateAssignmentFiringPointNumbers: [],
      missingParticipantIds: [],
    };
    const assignAthlete = vi
      .fn()
      .mockResolvedValueOnce({ success: true, data: { success: true } })
      .mockResolvedValueOnce({ success: true, data: { success: false } })
      .mockRejectedValueOnce(new Error('transport failed'));

    await expect(
      applyFiringPointAssignmentPlan({ competitionId: 'competition-1', plan, assignAthlete }),
    ).resolves.toEqual({
      succeeded: 1,
      skipped: 1,
      failedFiringPointNumbers: [2, 3],
    });
    expect(assignAthlete).toHaveBeenCalledTimes(3);
    expect(assignAthlete).toHaveBeenNthCalledWith(1, {
      competitionId: 'competition-1',
      laneId: 'lane-1',
      athlete: plan.assignments[0]?.athlete,
    });
  });
});
