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
const STOP_ID = '77777777-7777-4777-8777-777777777777';

function lane(stopped = false): DirectorLaneSnapshotDto {
  return {
    laneId: LANE_ID,
    laneAlias: 'Lane 1',
    firingPointNumber: 1,
    hardware: null,
    safetyState: stopped
      ? {
          laneId: LANE_ID,
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
    assignment: null,
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

  it('requires explicit range-safe confirmation and states that clearing does not resume timers', async () => {
    render(<SafetyStopPanel connected lanes={[lane(true)]} targetLaneIds={[LANE_ID]} />);
    expect(screen.getByText(/does not restart any timer/i)).toBeInTheDocument();
    const clearButton = screen.getByRole('button', { name: /Clear 1 Lane/ });
    expect(clearButton).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(clearButton).toBeEnabled();
    fireEvent.click(clearButton);
    await waitFor(() =>
      expect(clearSafetyStop).toHaveBeenCalledWith({
        safetyStopId: STOP_ID,
        laneIds: [LANE_ID],
        clearanceReason: 'Range inspected and declared safe',
        officialName: 'Director',
        confirmedSafe: true,
      }),
    );
  });
});
