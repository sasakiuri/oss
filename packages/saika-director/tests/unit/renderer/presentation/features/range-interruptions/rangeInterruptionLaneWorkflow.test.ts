import { describe, expect, it, vi } from 'vitest';

import {
  applyLanePause,
  applyLaneResume,
  type RangeInterruptionLaneWorkflowPorts,
} from '@/renderer/presentation/features/range-interruptions/rangeInterruptionLaneWorkflow';
import type { RangeInterruptionCaseDto } from '@/shared/ipc/contracts';

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const LANE_ID = '22222222-2222-4222-8222-222222222222';
const INTERRUPTION_ID = '33333333-3333-4333-8333-333333333333';
const COMMAND_ID = '44444444-4444-4444-8444-444444444444';

function fixture(): RangeInterruptionCaseDto {
  return {
    id: INTERRUPTION_ID,
    cause: 'ATHLETE_NON_FAULT',
    phase: 'MATCH',
    startedAt: '2026-08-31T01:00:00.000Z',
    remainingSecondsAtStart: 240,
    laneId: LANE_ID,
    firingPointNumber: 7,
    athleteName: 'Athlete A',
    summary: 'Interruption',
    details: 'Facts',
    openedBy: 'Officer A',
    createdAt: '2026-08-31T01:00:00.000Z',
    scopes: [],
    entries: [],
    targetRecoveryAssessments: [],
    status: 'OPEN',
    dataHoldActive: true,
    recommendation: null,
  };
}

function ports(): RangeInterruptionLaneWorkflowPorts {
  return {
    lane: {
      pauseLaneTimer: vi.fn().mockResolvedValue({
        success: true,
        data: {
          commandId: COMMAND_ID,
          action: 'pause-timer',
          success: true,
          lanes: [
            {
              laneId: LANE_ID,
              status: 'done',
              acknowledgedAt: '2026-08-31T01:00:02.000Z',
              data: {
                capturedAt: '2026-08-31T01:00:01.000Z',
                remainingSeconds: 238,
                totalSeconds: 600,
              },
            },
          ],
        },
      }),
      resumeLaneTimer: vi.fn().mockResolvedValue({
        success: true,
        data: {
          commandId: COMMAND_ID,
          action: 'resume-timer',
          success: true,
          lanes: [{ laneId: LANE_ID, status: 'done', acknowledgedAt: '2026-08-31T01:05:00.000Z' }],
        },
      }),
      resumeLaneMatch: vi.fn(),
    },
    ledger: {
      appendEntry: vi.fn().mockResolvedValue({ success: true, data: fixture() }),
    },
  };
}

describe('rangeInterruptionLaneWorkflow', () => {
  it('records the exact timer capture only after Lane STOP is acknowledged', async () => {
    const workflowPorts = ports();

    await applyLanePause(
      {
        competitionId: COMPETITION_ID,
        laneId: LANE_ID,
        interruptionId: INTERRUPTION_ID,
        officialName: 'Officer A',
      },
      workflowPorts,
    );

    expect(workflowPorts.ledger.appendEntry).toHaveBeenCalledWith({
      caseId: INTERRUPTION_ID,
      type: 'PAUSE_APPLIED',
      occurredAt: '2026-08-31T01:00:01.000Z',
      statement: 'Lane STOP acknowledged; timer captured at 3:58 remaining of 10:00.',
      officialName: 'Officer A',
      ruleReference: 'ISSF 6.10.9 / 6.11.3',
      commandId: COMMAND_ID,
    });
  });

  it('does not write a resume entry when the Lane rejects the command', async () => {
    const workflowPorts = ports();
    vi.mocked(workflowPorts.lane.resumeLaneTimer).mockResolvedValue({
      success: true,
      data: {
        commandId: COMMAND_ID,
        action: 'resume-timer',
        success: false,
        lanes: [
          {
            laneId: LANE_ID,
            status: 'error',
            error: { code: 'REJECTED', message: 'No matching interruption' },
          },
        ],
      },
    });

    await expect(
      applyLaneResume(
        {
          competitionId: COMPETITION_ID,
          laneId: LANE_ID,
          interruptionId: INTERRUPTION_ID,
          officialName: 'Officer A',
          authorizedRemainingSeconds: 300,
          unlimitedSightingShots: false,
        },
        workflowPorts,
      ),
    ).rejects.toThrow('No matching interruption');
    expect(workflowPorts.ledger.appendEntry).not.toHaveBeenCalled();
  });
});
