import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RangeInterruptionsPanel } from '@/renderer/presentation/features/range-interruptions';
import type { RangeInterruptionCaseDto } from '@/shared/ipc/contracts';

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const INTERRUPTION_ID = '33333333-3333-4333-8333-333333333333';
const LANE_ID = '44444444-4444-4444-8444-444444444444';

const {
  listAll,
  listByScope,
  create,
  linkScope,
  appendEntry,
  recordTargetRecovery,
  pauseLaneTimer,
  resumeLaneTimer,
  resumeLaneMatch,
} = vi.hoisted(() => ({
  listAll: vi.fn(),
  listByScope: vi.fn(),
  create: vi.fn(),
  linkScope: vi.fn(),
  appendEntry: vi.fn(),
  recordTargetRecovery: vi.fn(),
  pauseLaneTimer: vi.fn(),
  resumeLaneTimer: vi.fn(),
  resumeLaneMatch: vi.fn(),
}));

vi.mock('@/renderer/services', () => ({
  rangeInterruptionsService: { listAll, listByScope, create, linkScope, appendEntry, recordTargetRecovery },
  mqttService: { pauseLaneTimer, resumeLaneTimer, resumeLaneMatch },
}));

function fixture(overrides: Partial<RangeInterruptionCaseDto> = {}): RangeInterruptionCaseDto {
  return {
    id: INTERRUPTION_ID,
    cause: 'ATHLETE_NON_FAULT',
    phase: 'MATCH',
    startedAt: '2026-08-31T01:00:00.000Z',
    remainingSecondsAtStart: 240,
    laneId: LANE_ID,
    firingPointNumber: 12,
    athleteName: 'Alex Athlete',
    summary: 'Athlete stopped through no fault',
    details: 'The target carrier blocked the athlete.',
    openedBy: 'Range Officer A',
    createdAt: '2026-08-31T01:00:01.000Z',
    scopes: [
      {
        id: '55555555-5555-4555-8555-555555555555',
        caseId: INTERRUPTION_ID,
        scopeType: 'COMPETITION',
        scopeId: COMPETITION_ID,
        linkedBy: 'Range Officer A',
        note: 'Linked when opened',
        linkedAt: '2026-08-31T01:00:01.000Z',
      },
    ],
    entries: [],
    targetRecoveryAssessments: [],
    status: 'OPEN',
    dataHoldActive: true,
    recommendation: null,
    ...overrides,
  };
}

describe('RangeInterruptionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listByScope.mockResolvedValue({ success: true, data: [fixture()] });
    listAll.mockResolvedValue({ success: true, data: [fixture()] });
    create.mockResolvedValue({ success: true, data: fixture() });
    linkScope.mockResolvedValue({ success: true, data: fixture() });
    appendEntry.mockResolvedValue({ success: true, data: fixture() });
    recordTargetRecovery.mockResolvedValue({ success: true, data: fixture() });
    pauseLaneTimer.mockResolvedValue({
      success: true,
      data: {
        commandId: '66666666-6666-4666-8666-666666666666',
        action: 'pause-timer',
        success: true,
        lanes: [
          {
            laneId: LANE_ID,
            status: 'done',
            acknowledgedAt: '2026-08-31T01:00:03.000Z',
            data: {
              capturedAt: '2026-08-31T01:00:02.000Z',
              remainingSeconds: 238,
              totalSeconds: 600,
            },
          },
        ],
      },
    });
  });

  it('opens an append-only record without implicitly stopping a Lane', async () => {
    listByScope.mockResolvedValueOnce({ success: true, data: [] });
    render(
      <RangeInterruptionsPanel
        primaryScope={{ scopeType: 'COMPETITION', scopeId: COMPETITION_ID }}
        additionalScopes={[{ scopeType: 'EVENT', scopeId: EVENT_ID }]}
        competitionId={COMPETITION_ID}
        defaultLaneId={LANE_ID}
        defaultRemainingSeconds={240}
        lanes={[{ laneId: LANE_ID, label: 'Firing point 12', firingPointNumber: 12 }]}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Open record' }));
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Target carrier interruption' } });
    fireEvent.change(screen.getByLabelText('Observed facts'), { target: { value: 'Carrier stopped.' } });
    fireEvent.change(screen.getByLabelText('Opened by'), { target: { value: 'Officer B' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Open record' }).at(-1)!);

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          scopes: [
            { scopeType: 'COMPETITION', scopeId: COMPETITION_ID },
            { scopeType: 'EVENT', scopeId: EVENT_ID },
          ],
          laneId: LANE_ID,
          firingPointNumber: 12,
          remainingSecondsAtStart: 240,
          summary: 'Target carrier interruption',
        }),
      ),
    );
    expect(pauseLaneTimer).not.toHaveBeenCalled();
  });

  it('keeps the recommendation separate from an explicitly confirmed official grant', async () => {
    const ended = fixture({
      status: 'ENDED',
      entries: [
        {
          id: '77777777-7777-4777-8777-777777777777',
          caseId: INTERRUPTION_ID,
          type: 'ENDED',
          occurredAt: '2026-08-31T01:06:00.000Z',
          statement: 'Interruption ended.',
          officialName: 'Officer A',
          ruleReference: 'ISSF 6.11.3',
          lostTimeSeconds: 360,
          extensionSeconds: null,
          authorizedRemainingSeconds: null,
          unlimitedSightingShots: null,
          incidentReportReference: null,
          commandId: null,
          recordedAt: '2026-08-31T01:06:00.000Z',
        },
      ],
      recommendation: {
        basis: 'SIGHTING_AND_FIVE_MINUTES',
        lostTimeSeconds: 360,
        baseRemainingSeconds: 240,
        suggestedAdditionalSeconds: 360,
        suggestedAuthorizedRemainingSeconds: 600,
        unlimitedSightingShots: true,
        ruleReferences: 'ISSF 6.11.3.1-2',
        explanation: 'Recommendation only.',
      },
    });
    listByScope.mockResolvedValue({ success: true, data: [ended] });
    render(
      <RangeInterruptionsPanel
        primaryScope={{ scopeType: 'COMPETITION', scopeId: COMPETITION_ID }}
        competitionId={COMPETITION_ID}
      />,
    );

    expect(await screen.findByText(/not yet an authorization/i)).toBeInTheDocument();
    expect(appendEntry).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Record official grant' }));
    fireEvent.change(screen.getByLabelText('Range Incident Report reference'), { target: { value: 'RIR-42' } });
    fireEvent.change(screen.getByLabelText('Official name'), { target: { value: 'Jury Member C' } });
    fireEvent.change(screen.getByLabelText('Decision statement'), {
      target: { value: 'The Jury grants the recorded remedy.' },
    });
    fireEvent.click(screen.getByLabelText(/I confirm this is an official grant/i));
    fireEvent.click(screen.getAllByRole('button', { name: 'Record official grant' }).at(-1)!);

    await waitFor(() =>
      expect(appendEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          caseId: INTERRUPTION_ID,
          type: 'TIME_GRANTED',
          extensionSeconds: 360,
          authorizedRemainingSeconds: 600,
          unlimitedSightingShots: true,
          incidentReportReference: 'RIR-42',
          officialName: 'Jury Member C',
        }),
      ),
    );
  });

  it('appends a Lane STOP only after a separate acknowledged command', async () => {
    render(
      <RangeInterruptionsPanel
        primaryScope={{ scopeType: 'COMPETITION', scopeId: COMPETITION_ID }}
        competitionId={COMPETITION_ID}
        lanes={[{ laneId: LANE_ID, label: 'Firing point 12', firingPointNumber: 12 }]}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Apply Lane STOP' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send STOP' }));

    await waitFor(() =>
      expect(pauseLaneTimer).toHaveBeenCalledWith({
        competitionId: COMPETITION_ID,
        laneId: LANE_ID,
        interruptionId: INTERRUPTION_ID,
      }),
    );
    expect(appendEntry).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PAUSE_APPLIED', commandId: '66666666-6666-4666-8666-666666666666' }),
    );
  });
});
