import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SafetyStopPanel } from '@/renderer/presentation/features/range-safety/SafetyStopPanel';
import type { DirectorLaneSnapshotDto } from '@/shared/ipc/contracts';

const { activateSafetyStop, clearSafetyStop, getSafetyStopAudit } = vi.hoisted(() => ({
  activateSafetyStop: vi.fn(),
  clearSafetyStop: vi.fn(),
  getSafetyStopAudit: vi.fn(),
}));

vi.mock('@/renderer/services', () => ({
  mqttService: { activateSafetyStop, clearSafetyStop, getSafetyStopAudit },
}));

const LANE_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_LANE_ID = '33333333-3333-4333-8333-333333333333';
const STOP_ID = '77777777-7777-4777-8777-777777777777';

function lane(stopped = false, assigned = false, laneId = LANE_ID, firingPointNumber = 1): DirectorLaneSnapshotDto {
  return {
    laneId,
    laneAlias: `Lane ${firingPointNumber}`,
    firingPointNumber,
    hardware: null,
    safetyState: stopped
      ? {
          laneId,
          status: 'STOPPED',
          safetyStopId: STOP_ID,
          reason: 'Emergency',
          stoppedBy: 'Director',
          stoppedAt: '2026-09-01T01:00:00.000Z',
          timerSnapshot: null,
          clearedBy: null,
          clearanceReason: null,
          clearedAt: null,
          publishedAt: '2026-09-01T01:00:00.000Z',
        }
      : null,
    competitionState: null,
    assignment: assigned
      ? {
          competitionId: '22222222-2222-4222-8222-222222222222',
          laneId,
          athlete: {
            id: `athlete-${firingPointNumber}`,
            name: `Athlete ${firingPointNumber}`,
            startNumber: 100 + firingPointNumber,
          },
          assignedAt: '2026-09-01T00:30:00.000Z',
          publishedAt: '2026-09-01T00:30:00.000Z',
        }
      : null,
    score: null,
    lastRawShot: null,
    lastCompetitionShot: null,
    lastSeenAt: '2026-09-01T01:00:00.000Z',
  };
}

describe('SafetyStopPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSafetyStopAudit.mockResolvedValue({ success: true, data: [] });
    activateSafetyStop.mockResolvedValue({
      success: true,
      data: { success: true, commands: [{ success: true, action: 'activate-safety-stop', lanes: [] }] },
    });
    clearSafetyStop.mockResolvedValue({
      success: true,
      data: { success: true, commands: [{ success: true, action: 'clear-safety-stop', lanes: [] }] },
    });
  });

  it('issues an immediate STOP with a stable operation id and all target Lanes', async () => {
    render(<SafetyStopPanel connected lanes={[lane()]} targetLaneIds={[LANE_ID]} />);
    fireEvent.click(screen.getByRole('button', { name: /EMERGENCY STOP/ }));
    await waitFor(() => expect(activateSafetyStop).toHaveBeenCalledOnce());
    expect(activateSafetyStop).toHaveBeenCalledWith({
      safetyStopId: expect.any(String),
      laneIds: [LANE_ID],
      reason: 'Emergency range safety stop',
      officialName: 'Director',
    });
  });

  it('requires per-Lane athlete, firearm, and personnel checks and states that clearing does not resume timers', async () => {
    render(
      <SafetyStopPanel
        connected
        lanes={[lane(true, true), lane(true, true, SECOND_LANE_ID, 2)]}
        targetLaneIds={[LANE_ID, SECOND_LANE_ID]}
      />,
    );
    expect(screen.getByText(/does not restart a timer/i)).toBeInTheDocument();
    let clearButton = screen.getByRole('button', { name: /Clear 0 verified Lane/ });
    expect(clearButton).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Select safety clearance for Firing point 1'));
    fireEvent.change(screen.getByLabelText('Athlete confirmation for Firing point 1'), {
      target: { value: 'CONFIRMED' },
    });
    expect(clearButton).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Personnel clear for Firing point 1'));
    clearButton = screen.getByRole('button', { name: /Clear 1 verified Lane/ });
    expect(clearButton).toBeEnabled();
    fireEvent.click(clearButton);
    await waitFor(() =>
      expect(clearSafetyStop).toHaveBeenCalledWith({
        safetyStopId: STOP_ID,
        clearanceReason: 'Range inspected and declared safe',
        officialName: 'Director',
        laneClearances: [
          {
            laneId: LANE_ID,
            participantId: 'athlete-1',
            participantName: 'Athlete 1',
            athleteConfirmation: { status: 'CONFIRMED', confirmedBy: 'Athlete 1' },
            firearmCondition: 'UNLOADED_SAFETY_FLAG_INSERTED',
            personnelClear: true,
            verifiedBy: 'Director',
          },
        ],
      }),
    );
  });
});
