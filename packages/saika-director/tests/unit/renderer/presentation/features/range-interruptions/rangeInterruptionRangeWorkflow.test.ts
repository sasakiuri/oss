import { describe, expect, it, vi } from 'vitest';

import {
  applyRangeMatchResume,
  applyRangePause,
  applyRangeResume,
  type RangeInterruptionRangeWorkflowPorts,
} from '@/renderer/presentation/features/range-interruptions/rangeInterruptionRangeWorkflow';

import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';
import { fixture } from './fixtures';

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const INTERRUPTION_ID = '33333333-3333-4333-8333-333333333333';
const LANE_A = '44444444-4444-4444-8444-444444444444';
const LANE_B = '55555555-5555-4555-8555-555555555555';
const COMMAND_ID = '66666666-6666-4666-8666-666666666666';

const context = {
  competitionId: COMPETITION_ID,
  targetLaneIds: [LANE_A, LANE_B],
  commandLaneIds: [LANE_A, LANE_B],
  interruptionId: INTERRUPTION_ID,
  officialName: 'Officer A',
};

function batch(statusB: 'done' | 'timeout') {
  return ok({
    success: statusB === 'done',
    commands: [
      {
        commandId: COMMAND_ID,
        action: 'pause-timer' as const,
        success: statusB === 'done',
        lanes: [
          { laneId: LANE_A, status: 'done' as const, acknowledgedAt: '2026-08-31T01:00:02.000Z' },
          { laneId: LANE_B, status: statusB },
        ],
      },
    ],
  });
}

function ports(): RangeInterruptionRangeWorkflowPorts {
  return {
    lane: {
      pauseRangeTimers: vi.fn().mockResolvedValue(batch('done')),
      resumeRangeTimers: vi.fn().mockResolvedValue(batch('done')),
      resumeRangeMatch: vi.fn().mockResolvedValue(batch('done')),
    },
    ledger: {
      recordCommandBatch: vi.fn().mockResolvedValue(ok(fixture({ laneId: null }))),
    },
  };
}

describe('rangeInterruptionRangeWorkflow', () => {
  it('records every Lane outcome and returns the recorded case', async () => {
    const workflowPorts = ports();

    await expect(applyRangePause(context, workflowPorts)).resolves.toMatchObject({ id: INTERRUPTION_ID });
    expect(workflowPorts.ledger.recordCommandBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: INTERRUPTION_ID,
        operation: 'PAUSE',
        targetLaneIds: [LANE_A, LANE_B],
        commands: [
          {
            commandId: COMMAND_ID,
            action: 'pause-timer',
            lanes: [
              { laneId: LANE_A, status: 'done', acknowledgedAt: '2026-08-31T01:00:02.000Z' },
              { laneId: LANE_B, status: 'done' },
            ],
          },
        ],
      }),
    );
  });

  it('raises a failed command response as its message without recording a batch', async () => {
    const workflowPorts = ports();
    vi.mocked(workflowPorts.lane.resumeRangeTimers).mockResolvedValue(fail('MQTT broker is not connected'));

    await expect(
      applyRangeResume({ ...context, authorizedRemainingSeconds: 300, unlimitedSightingShots: false }, workflowPorts),
    ).rejects.toThrow(/^MQTT broker is not connected$/);
    expect(workflowPorts.ledger.recordCommandBatch).not.toHaveBeenCalled();
  });

  it('raises a failed ledger response as its message', async () => {
    const workflowPorts = ports();
    vi.mocked(workflowPorts.ledger.recordCommandBatch).mockResolvedValue(fail('The record is closed'));

    await expect(applyRangeMatchResume(context, workflowPorts)).rejects.toThrow(/^The record is closed$/);
  });

  it('records a partial batch and then reports the Lanes that still require a retry', async () => {
    const workflowPorts = ports();
    vi.mocked(workflowPorts.lane.pauseRangeTimers).mockResolvedValue(batch('timeout'));

    await expect(applyRangePause(context, workflowPorts)).rejects.toThrow(
      new RegExp(`^The range command was recorded, but 1 Lane\\(s\\) still require retry: ${LANE_B}$`),
    );
    expect(workflowPorts.ledger.recordCommandBatch).toHaveBeenCalledOnce();
  });
});
