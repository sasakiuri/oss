// SPDX-License-Identifier: MIT

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { QualificationMalfunctionSignalControl } from '@/renderer/presentation/components/QualificationMalfunctionSignalControl';

const mocks = vi.hoisted(() => ({
  getSignal: vi.fn(),
  declare: vi.fn(),
  clear: vi.fn(),
  getMqttStatus: vi.fn(),
}));

vi.mock('@/renderer/services/mqttService', () => ({
  mqttService: {
    getQualificationMalfunctionSignal: mocks.getSignal,
    declareQualificationMalfunction: mocks.declare,
    clearQualificationMalfunctionSignal: mocks.clear,
    getMqttStatus: mocks.getMqttStatus,
  },
}));

const emptyState = {
  schemaVersion: 1 as const,
  laneId: '11111111-1111-4111-8111-111111111111',
  status: 'CLEARED' as const,
  signalId: null,
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
  },
  message: 'Possible failure to fire',
  signalledAt: '2026-09-04T00:00:00.000Z',
};

describe('QualificationMalfunctionSignalControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSignal.mockResolvedValue(emptyState);
    mocks.getMqttStatus.mockResolvedValue({ status: 'connected' });
    mocks.declare.mockResolvedValue(activeState);
    mocks.clear.mockResolvedValue({
      ...activeState,
      status: 'CLEARED',
      clearedAt: '2026-09-04T00:01:00.000Z',
      clearedBy: 'Lane user',
    });
  });

  it('sends only an optional observation while the main process captures trusted context', async () => {
    render(<QualificationMalfunctionSignalControl isOpen onClose={vi.fn()} onActiveChange={vi.fn()} />);

    expect(await screen.findByText(/Keep the firearm pointed safely downrange/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Observation (optional)'), {
      target: { value: ' Possible failure to fire ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Declare possible malfunction' }));

    await waitFor(() => expect(mocks.declare).toHaveBeenCalledWith({ message: 'Possible failure to fire' }));
    expect(await screen.findByText('Official attention requested')).toBeInTheDocument();
    expect(screen.getByText(/does not stop firing, alter the timer, classify/)).toBeInTheDocument();
  });

  it('shows the captured audit snapshot and clears only by signal identity', async () => {
    mocks.getSignal.mockResolvedValue(activeState);
    render(<QualificationMalfunctionSignalControl isOpen onClose={vi.fn()} onActiveChange={vi.fn()} />);

    expect(await screen.findByText(/#12 Test Athlete/)).toBeInTheDocument();
    expect(screen.getByText('3 / 5')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Clear after official acknowledgement/ }));

    await waitFor(() => expect(mocks.clear).toHaveBeenCalledWith({ signalId: activeState.signalId }));
  });
});
