// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from 'vitest';

import type { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import {
  type ILaneAssignmentSnapshotSource,
  LaneQualificationMalfunctionContextSource,
} from '@/main/modules/mqtt/application/LaneQualificationMalfunctionContextSource';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { Session } from '@/main/modules/session/domain/Session';
import type { ITimedTargetControl } from '@/main/modules/timed-target';

const competitionId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';

function contextSource(options: { assigned?: boolean; timed?: boolean } = {}) {
  const competition = {
    id: competitionId,
    sessionId,
    phase: 'ACTIVE',
    currentStageIndex: 1,
    currentSeriesIndex: 2,
    seriesShotCount: 3,
    config: {
      stages: [
        { name: 'Sighting', series: [{ maxShots: 5 }] },
        {
          name: 'Rapid',
          series: [
            { maxShots: 5, timedTargetProgramId: 'rapid-8s' },
            { maxShots: 5, timedTargetProgramId: 'rapid-6s' },
            { maxShots: 5, timedTargetProgramId: 'rapid-4s' },
          ],
        },
      ],
    },
  } as unknown as CompetitionState;
  const competitions = {
    findActive: vi.fn().mockResolvedValue(competition),
  } as unknown as ICompetitionRepository;
  const sessions = {
    findById: vi.fn().mockResolvedValue({ isFinished: false, mode: { value: 'MATCH' } } as Session),
  } as unknown as ISessionRepository;
  const assignments = {
    getCurrentAssignment: vi.fn().mockReturnValue(
      options.assigned === false
        ? null
        : {
            competitionId,
            athlete: { id: 'participant-12', name: 'Test Athlete', startNumber: 12 },
            assignedAt: '2026-09-04T00:00:00.000Z',
          },
    ),
  } as ILaneAssignmentSnapshotSource;
  const timedTargets = {
    getState: vi.fn().mockReturnValue(
      options.timed === false
        ? null
        : {
            competitionId,
            stageIndex: 1,
            seriesIndex: 2,
            programId: 'rapid-4s',
            exposureIndex: 2,
          },
    ),
  } as unknown as Pick<ITimedTargetControl, 'getState'>;

  return new LaneQualificationMalfunctionContextSource(competitions, sessions, assignments, timedTargets);
}

describe('LaneQualificationMalfunctionContextSource', () => {
  it('captures trusted athlete, shot and exposure context from Lane state', async () => {
    await expect(contextSource().capture()).resolves.toEqual({
      competitionId,
      sessionId,
      participantId: 'participant-12',
      participantName: 'Test Athlete',
      startNumber: '12',
      phase: 'MATCH',
      stageIndex: 1,
      seriesIndex: 2,
      seriesShotLimit: 5,
      recordedShots: 3,
      timedTargetProgramId: 'rapid-4s',
      exposureIndex: 2,
    });
  });

  it('uses configured timed-target context when no sequence is currently exposed', async () => {
    await expect(contextSource({ timed: false }).capture()).resolves.toMatchObject({
      timedTargetProgramId: 'rapid-4s',
      exposureIndex: null,
    });
  });

  it('requires an athlete assignment rather than accepting identity from the Renderer', async () => {
    await expect(contextSource({ assigned: false }).capture()).rejects.toThrow('assigned athlete is required');
  });
});
