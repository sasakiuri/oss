// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from 'vitest';

import type { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import { LaneEstComplaintContextSource } from '@/main/modules/mqtt/application/LaneEstComplaintContextSource';
import type { ILaneAssignmentSnapshotSource } from '@/main/modules/mqtt/application/LaneQualificationMalfunctionContextSource';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { Session } from '@/main/modules/session/domain/Session';
import type { Shot } from '@/main/modules/session/domain/Shot';
import type { ITimedTargetControl } from '@/main/modules/timed-target';

const competitionId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const shotId = '33333333-3333-4333-8333-333333333333';

function contextSource(options: { assigned?: boolean; withShot?: boolean } = {}) {
  const competition = {
    id: competitionId,
    sessionId,
    phase: 'ACTIVE',
    currentStageIndex: 0,
    currentSeriesIndex: 0,
    seriesShotCount: options.withShot === false ? 0 : 1,
    config: {
      stages: [
        {
          scored: true,
          series: [{ maxShots: 10, purpose: 'STANDARD', timedTargetProgramId: 'rapid-4s' }],
        },
      ],
    },
  } as unknown as CompetitionState;
  const shot = {
    id: shotId,
    mode: { value: 'MATCH', isMatch: () => true },
    seriesNumber: 1,
    shotNumber: 1,
    timestamp: new Date('2026-09-04T00:00:00.000Z'),
    receivedAt: new Date('2026-09-04T00:00:00.100Z'),
  } as unknown as Shot;
  const session = {
    isFinished: false,
    mode: { value: 'MATCH' },
    allShots: options.withShot === false ? [] : [shot],
  } as unknown as Session;
  const competitions = { findActive: vi.fn().mockResolvedValue(competition) } as unknown as ICompetitionRepository;
  const sessions = { findById: vi.fn().mockResolvedValue(session) } as unknown as ISessionRepository;
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
    getState: vi.fn().mockReturnValue({
      competitionId,
      stageIndex: 0,
      seriesIndex: 0,
      programId: 'rapid-4s',
      exposureIndex: 0,
    }),
  } as unknown as Pick<ITimedTargetControl, 'getState'>;

  return new LaneEstComplaintContextSource(competitions, sessions, assignments, timedTargets);
}

describe('LaneEstComplaintContextSource', () => {
  it('captures trusted athlete, competition and latest-shot context from Lane state', async () => {
    await expect(contextSource().capture()).resolves.toEqual({
      competitionId,
      sessionId,
      participantId: 'participant-12',
      participantName: 'Test Athlete',
      startNumber: '12',
      phase: 'MATCH',
      stageIndex: 0,
      seriesIndex: 0,
      seriesShotLimit: 10,
      recordedShots: 1,
      timedTargetProgramId: 'rapid-4s',
      exposureIndex: 0,
      lastShot: {
        shotId,
        shotNumberInSeries: 1,
        firedAt: '2026-09-04T00:00:00.000Z',
        receivedAt: '2026-09-04T00:00:00.100Z',
      },
    });
  });

  it('allows target failures before a shot has been recorded', async () => {
    await expect(contextSource({ withShot: false }).capture()).resolves.toMatchObject({
      recordedShots: 0,
      lastShot: null,
    });
  });

  it('requires an athlete assignment rather than accepting identity from the Renderer', async () => {
    await expect(contextSource({ assigned: false }).capture()).rejects.toThrow('assigned athlete is required');
  });
});
