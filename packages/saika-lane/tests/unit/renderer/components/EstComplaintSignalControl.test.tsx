// SPDX-License-Identifier: MIT

import { identifyRulePack, ISSF_2026_AR60_FINAL } from '@sasakiuri/saika-rules';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EstComplaintSignalControl } from '@/renderer/presentation/components/EstComplaintSignalControl';

const mocks = vi.hoisted(() => ({
  getSignal: vi.fn(),
  getContext: vi.fn(),
  declare: vi.fn(),
  clear: vi.fn(),
  getMqttStatus: vi.fn(),
}));

vi.mock('@/renderer/services/mqttService', () => ({
  mqttService: {
    getEstComplaintSignal: mocks.getSignal,
    getEstComplaintContext: mocks.getContext,
    declareEstComplaint: mocks.declare,
    clearEstComplaintSignal: mocks.clear,
    getMqttStatus: mocks.getMqttStatus,
  },
}));

const emptyState = {
  schemaVersion: 1 as const,
  laneId: '11111111-1111-4111-8111-111111111111',
  status: 'CLEARED' as const,
  signalId: null,
  issue: null,
  context: null,
  message: null,
  signalledAt: null,
  clearedAt: null,
  clearedBy: null,
  publishedAt: '2026-09-04T00:00:00.000Z',
};

const activeState = {
  ...emptyState,
  status: 'ACTIVE' as const,
  signalId: '22222222-2222-4222-8222-222222222222',
  issue: 'SHOT_VALUE' as const,
  context: {
    competitionId: '33333333-3333-4333-8333-333333333333',
    sessionId: '44444444-4444-4444-8444-444444444444',
    participantId: 'participant-12',
    participantName: 'Test Athlete',
    startNumber: '12',
    phase: 'MATCH' as const,
    stageIndex: 1,
    seriesIndex: 2,
    seriesShotLimit: 5,
    recordedShots: 3,
    timedTargetProgramId: 'rapid-4s',
    exposureIndex: 2,
    lastShot: {
      shotId: '55555555-5555-4555-8555-555555555555',
      shotNumberInSeries: 3,
      firedAt: '2026-09-04T00:00:00.000Z',
      receivedAt: '2026-09-04T00:00:00.100Z',
    },
  },
  message: 'Displayed value looks wrong',
  signalledAt: '2026-09-04T00:00:01.000Z',
};

describe('EstComplaintSignalControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSignal.mockResolvedValue(emptyState);
    mocks.getContext.mockResolvedValue(activeState.context);
    mocks.getMqttStatus.mockResolvedValue({ status: 'connected' });
    mocks.declare.mockResolvedValue(activeState);
    mocks.clear.mockResolvedValue({
      ...activeState,
      status: 'CLEARED',
      clearedAt: '2026-09-04T00:01:00.000Z',
      clearedBy: 'Lane user',
    });
  });

  it('shows the Final-specific score-protest and missing-shot procedures before submission', async () => {
    const pack = ISSF_2026_AR60_FINAL;
    mocks.getContext.mockResolvedValue({
      ...activeState.context,
      rules: {
        round: pack.round,
        identity: identifyRulePack(pack),
        procedures: pack.capabilities.estComplaints!.procedures,
      },
    });
    render(<EstComplaintSignalControl isOpen onClose={vi.fn()} onActiveChange={vi.fn()} />);
    expect(await screen.findByText(/not permitted in Finals/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Complaint'), { target: { value: 'SHOT_NOT_REGISTERED' } });
    expect(await screen.findByText(/Final EST procedure/)).toBeInTheDocument();
    expect(screen.queryByText(/No repeat series/)).not.toBeInTheDocument();
    expect(mocks.declare).not.toHaveBeenCalled();
  });

  it('sends only the complaint issue and observation while main captures trusted context', async () => {
    render(<EstComplaintSignalControl isOpen onClose={vi.fn()} onActiveChange={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText('Complaint'), { target: { value: 'SHOT_NOT_REGISTERED' } });
    fireEvent.change(screen.getByLabelText('Observation (optional)'), {
      target: { value: ' Shot missing from display ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Raise EST complaint' }));

    await waitFor(() =>
      expect(mocks.declare).toHaveBeenCalledWith({
        issue: 'SHOT_NOT_REGISTERED',
        message: 'Shot missing from display',
      }),
    );
    expect(await screen.findByText('Displayed shot value')).toBeInTheDocument();
    expect(screen.getByText(/does not decide whether the complaint is timely or valid/)).toBeInTheDocument();
  });

  it('shows the captured latest shot and clears only by signal identity', async () => {
    mocks.getSignal.mockResolvedValue(activeState);
    render(<EstComplaintSignalControl isOpen onClose={vi.fn()} onActiveChange={vi.fn()} />);

    expect(await screen.findByText(/#12 Test Athlete/)).toBeInTheDocument();
    expect(screen.getByText('3 / 5')).toBeInTheDocument();
    expect(screen.getByText(/#3 at/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Clear after official acknowledgement/ }));

    await waitFor(() => expect(mocks.clear).toHaveBeenCalledWith({ signalId: activeState.signalId }));
  });

  it.each([
    ['BEFORE_NEXT_SHOT', /before the next shot/i],
    ['AFTER_SERIES', /Continue the five-shot series/i],
  ] as const)(
    'keeps %s guidance consistent before and after a missing-shot complaint',
    async (notification, guidance) => {
      const context = {
        ...activeState.context,
        missingShotProcedure: { notification, seriesRepeatAllowed: false, ruleReference: '8.10.3' },
      };
      mocks.getContext.mockResolvedValue(context);
      mocks.declare.mockResolvedValue({ ...activeState, issue: 'SHOT_NOT_REGISTERED', context });
      render(<EstComplaintSignalControl isOpen onClose={vi.fn()} onActiveChange={vi.fn()} />);
      fireEvent.change(await screen.findByLabelText('Complaint'), { target: { value: 'SHOT_NOT_REGISTERED' } });

      expect(await screen.findByText(guidance)).toBeInTheDocument();
      expect(mocks.declare).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Raise EST complaint' }));
      await screen.findByRole('button', { name: /Clear after official acknowledgement/ });
      expect(screen.getByText(guidance)).toBeInTheDocument();
      expect(screen.queryByText(/do not fire another shot unless instructed/i)).not.toBeInTheDocument();
      expect(screen.getByText(/including STOP and UNLOAD/)).toBeInTheDocument();
    },
  );

  it('allows a complaint when preview is unavailable and shows the freshly captured procedure', async () => {
    mocks.getContext.mockRejectedValue(new Error('No active session'));
    mocks.declare.mockResolvedValue({
      ...activeState,
      issue: 'SHOT_NOT_REGISTERED',
      context: {
        ...activeState.context,
        missingShotProcedure: {
          notification: 'AFTER_SERIES',
          seriesRepeatAllowed: false,
          ruleReference: '8.10.3',
        },
      },
    });
    render(<EstComplaintSignalControl isOpen onClose={vi.fn()} onActiveChange={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText('Complaint'), { target: { value: 'SHOT_NOT_REGISTERED' } });
    expect(await screen.findByText(/Confirm the procedure with the Range Officer/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Raise EST complaint' }));
    expect(await screen.findByText(/Continue the five-shot series/)).toBeInTheDocument();
  });
});
