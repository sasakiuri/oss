// SPDX-License-Identifier: MIT
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EventBus } from '@/renderer/events/EventBus';
import { EventBusProvider } from '@/renderer/events/EventBusProvider';
import { CompetitionControlScreen } from '@/renderer/presentation/features/competition-control/CompetitionControlScreen';
import { useCompetitionControlStore } from '@/renderer/presentation/stores/domain/competitionControl.store';
import { useConfirmDialogStore } from '@/renderer/presentation/stores/ui/confirmDialog.store';
import { useNotificationStore } from '@/renderer/presentation/stores/ui/notifications.store';
import type { MqttControlSnapshotDto } from '@/shared/ipc/contracts';

const {
  assignAthlete,
  createCompetition,
  finishCompetition,
  getControlState,
  getParticipants,
  joinCompetition,
  leaveCompetition,
  resetSession,
  startSighting,
} = vi.hoisted(() => ({
  assignAthlete: vi.fn(),
  createCompetition: vi.fn(),
  finishCompetition: vi.fn(),
  getControlState: vi.fn(),
  getParticipants: vi.fn(),
  joinCompetition: vi.fn(),
  leaveCompetition: vi.fn(),
  resetSession: vi.fn(),
  startSighting: vi.fn(),
}));

vi.mock('@/renderer/services', () => ({
  mqttService: {
    getControlState,
    createCompetition,
    joinCompetition,
    leaveCompetition,
    assignAthlete,
    resetSession,
    startSighting,
    endSighting: vi.fn(),
    startMatch: vi.fn(),
    advanceSeries: vi.fn(),
    finishCompetition,
  },
  championshipService: {
    getParticipants,
  },
}));

vi.mock('@/renderer/presentation/features/competition-control/components/ChampionshipAssignmentPanel', () => ({
  ChampionshipAssignmentPanel: ({ disabled }: { disabled: boolean }) => (
    <button type="button" disabled={disabled}>
      Championship Assignment Test
    </button>
  ),
}));

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_COMPETITION_ID = '77777777-7777-4777-8777-777777777777';
const LANE_ID = '22222222-2222-4222-8222-222222222222';
const SECOND_LANE_ID = '55555555-5555-4555-8555-555555555555';
const THIRD_LANE_ID = '66666666-6666-4666-8666-666666666666';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';
const PARTICIPANT_ID = '44444444-4444-4444-8444-444444444444';

const completedSnapshot: MqttControlSnapshotDto = {
  connected: true,
  brokerUrl: 'mqtt://localhost:1883',
  activeCompetitionId: COMPETITION_ID,
  competitions: [
    {
      competitionId: COMPETITION_ID,
      competitionTypeId: 'BR60S',
      competitionTypeName: 'BR60S',
      discipline: 'BEAM_RIFLE_10M',
      roundName: 'Qualification',
      acc: 'DECIMAL',
      phase: 'MATCH_COMPLETE',
      shotsPerSeries: 10,
      totalSeries: 6,
      totalShots: 60,
      laneIds: [LANE_ID],
      startedAt: '2026-08-26T00:00:00.000Z',
      finishedAt: '2026-08-26T01:00:00.000Z',
      publishedAt: '2026-08-26T01:00:00.000Z',
    },
  ],
  lanes: [
    {
      laneId: LANE_ID,
      laneAlias: 'Lane 1',
      firingPointNumber: 1,
      hardware: null,
      competitionState: null,
      assignment: null,
      score: null,
      lastRawShot: null,
      lastCompetitionShot: null,
      lastSeenAt: '2026-08-26T01:00:00.000Z',
    },
  ],
  lastCommand: null,
};

const eventHandlers = new Map<string, (data: unknown) => void>();
const eventBus: EventBus = {
  subscribe: vi.fn((event: string, handler: (data: unknown) => void) => {
    eventHandlers.set(event, handler);
    return () => eventHandlers.delete(event);
  }) as EventBus['subscribe'],
  unsubscribeAll: vi.fn(),
  getSubscriptionCount: vi.fn(() => 0),
};

describe('CompetitionControlScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventHandlers.clear();
    useCompetitionControlStore.getState().reset();
    useNotificationStore.setState({ notifications: [] });
    if (useConfirmDialogStore.getState().isOpen) useConfirmDialogStore.getState().handleCancel();
    getControlState.mockResolvedValue({ success: true, data: completedSnapshot });
    getParticipants.mockResolvedValue({
      success: true,
      data: {
        participants: [
          {
            id: PARTICIPANT_ID,
            playerName: 'Alex Smith',
            affiliation: 'Tokyo',
            logoPath: null,
            sortOrder: 0,
          },
        ],
      },
    });
    assignAthlete.mockResolvedValue({
      success: true,
      data: {
        commandId: '55555555-5555-4555-8555-555555555555',
        action: 'assign-athlete',
        success: true,
        lanes: [{ laneId: LANE_ID, status: 'done' }],
      },
    });
    resetSession.mockResolvedValue({
      success: true,
      data: {
        commandId: '77777777-7777-4777-8777-777777777777',
        action: 'reset-session',
        success: true,
        lanes: [{ laneId: LANE_ID, status: 'done' }],
      },
    });
    finishCompetition.mockResolvedValue({
      success: true,
      data: {
        commandId: '88888888-8888-4888-8888-888888888888',
        action: 'finish-competition',
        success: true,
        lanes: [{ laneId: LANE_ID, status: 'done' }],
      },
    });
  });

  it('warns and confirms before finishing a competition without result publication', async () => {
    getControlState.mockResolvedValue({
      success: true,
      data: {
        ...completedSnapshot,
        competitions: [
          {
            ...completedSnapshot.competitions[0]!,
            phase: 'MATCH',
            finishedAt: null,
            publishedAt: null,
          },
        ],
      },
    });

    render(
      <EventBusProvider bus={eventBus}>
        <CompetitionControlScreen />
      </EventBusProvider>,
    );

    expect(
      await screen.findByText(
        'No championship assignment is linked. Results will not be saved to championship management.',
      ),
    ).toBeInTheDocument();
    const finishButton = screen.getByRole('button', { name: 'Finish competition' });
    await waitFor(() => expect(finishButton).toBeEnabled());
    fireEvent.click(finishButton);

    expect(finishCompetition).not.toHaveBeenCalled();
    expect(useConfirmDialogStore.getState()).toMatchObject({
      isOpen: true,
      message: expect.stringMatching(/Results will not be saved to championship management.*cannot be undone/),
    });

    act(() => useConfirmDialogStore.getState().handleConfirm());

    await waitFor(() =>
      expect(finishCompetition).toHaveBeenCalledWith({
        competitionId: COMPETITION_ID,
      }),
    );
  });

  it('confirms the result publication destination before finishing a linked competition', async () => {
    getControlState.mockResolvedValue({
      success: true,
      data: {
        ...completedSnapshot,
        competitions: [
          {
            ...completedSnapshot.competitions[0]!,
            phase: 'MATCH',
            finishedAt: null,
            publishedAt: null,
          },
        ],
      },
    });
    useCompetitionControlStore.getState().setResultContext(COMPETITION_ID, {
      eventId: EVENT_ID,
      relayNumber: 1,
    });

    render(
      <EventBusProvider bus={eventBus}>
        <CompetitionControlScreen />
      </EventBusProvider>,
    );

    await screen.findByText(/MATCH/);
    expect(screen.queryByText(/No championship assignment is linked/)).not.toBeInTheDocument();
    const finishButton = screen.getByRole('button', { name: 'Finish competition' });
    await waitFor(() => expect(finishButton).toBeEnabled());
    fireEvent.click(finishButton);

    expect(finishCompetition).not.toHaveBeenCalled();
    expect(useConfirmDialogStore.getState()).toMatchObject({
      isOpen: true,
      message: expect.stringContaining('Save relay 1 results'),
    });

    act(() => useConfirmDialogStore.getState().handleConfirm());

    await waitFor(() =>
      expect(finishCompetition).toHaveBeenCalledWith({
        competitionId: COMPETITION_ID,
        resultContext: { eventId: EVENT_ID, relayNumber: 1 },
      }),
    );
  });

  it('confirms and permits session reset only before competition start', async () => {
    getControlState.mockResolvedValue({
      success: true,
      data: {
        ...completedSnapshot,
        competitions: [
          {
            ...completedSnapshot.competitions[0]!,
            phase: 'NOT_STARTED',
            startedAt: null,
            finishedAt: null,
          },
        ],
      },
    });

    render(
      <EventBusProvider bus={eventBus}>
        <CompetitionControlScreen />
      </EventBusProvider>,
    );

    const resetButton = await screen.findByRole('button', { name: 'Reset session' });
    await waitFor(() => expect(resetButton).toBeEnabled());
    fireEvent.click(resetButton);

    expect(resetSession).not.toHaveBeenCalled();
    expect(useConfirmDialogStore.getState()).toMatchObject({
      isOpen: true,
      message: expect.stringContaining('cannot be undone'),
    });

    act(() => useConfirmDialogStore.getState().handleConfirm());

    await waitFor(() =>
      expect(resetSession).toHaveBeenCalledWith({
        competitionId: COMPETITION_ID,
        laneId: LANE_ID,
        reason: 'Director pre-competition reset',
      }),
    );
  });

  it('abandons a linked pre-match competition without publishing a zero-score result', async () => {
    finishCompetition.mockResolvedValueOnce({
      success: false,
      error: { message: 'MQTT cleanup failed' },
    });
    getControlState.mockResolvedValue({
      success: true,
      data: {
        ...completedSnapshot,
        competitions: [
          {
            ...completedSnapshot.competitions[0]!,
            phase: 'NOT_STARTED',
            startedAt: null,
            finishedAt: null,
          },
        ],
      },
    });
    useCompetitionControlStore.getState().setResultContext(COMPETITION_ID, {
      eventId: EVENT_ID,
      relayNumber: 1,
    });

    render(
      <EventBusProvider bus={eventBus}>
        <CompetitionControlScreen />
      </EventBusProvider>,
    );

    expect(
      await screen.findByText('Finishing before the match starts will abandon the competition without saving results.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Finish competition' }));

    expect(useConfirmDialogStore.getState()).toMatchObject({
      isOpen: true,
      message: expect.stringMatching(/match has not started.*results will not be saved.*cannot be undone/i),
    });
    act(() => useConfirmDialogStore.getState().handleConfirm());

    await waitFor(() => expect(finishCompetition).toHaveBeenCalledWith({ competitionId: COMPETITION_ID }));
    expect(useCompetitionControlStore.getState().getResultContext(COMPETITION_ID)).toBeNull();
  });

  it('keeps result-repair assignments available after a recoverable finish failure', async () => {
    render(
      <EventBusProvider bus={eventBus}>
        <CompetitionControlScreen />
      </EventBusProvider>,
    );

    await screen.findByText(/MATCH_COMPLETE/);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Assign athlete' })).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Unassign' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Championship Assignment Test' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reset session' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Retry cleanup' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Start sighting (10 min)' })).toBeDisabled();
  });

  it('locks athlete assignments during active competition and after result publication', async () => {
    getControlState.mockResolvedValue({
      success: true,
      data: {
        ...completedSnapshot,
        competitions: [
          {
            ...completedSnapshot.competitions[0]!,
            phase: 'MATCH',
            finishedAt: null,
          },
        ],
      },
    });

    render(
      <EventBusProvider bus={eventBus}>
        <CompetitionControlScreen />
      </EventBusProvider>,
    );

    const assignButton = await screen.findByRole('button', { name: 'Assign athlete' });
    expect(assignButton).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Unassign' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Championship Assignment Test' })).toBeDisabled();

    act(() => {
      eventHandlers.get('mqttControlStateChanged')!({
        ...completedSnapshot,
        competitions: [
          {
            ...completedSnapshot.competitions[0]!,
            cleanupPreparedAt: '2026-08-26T01:00:01.000Z',
          },
        ],
      });
    });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Assign athlete' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Unassign' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Championship Assignment Test' })).toBeDisabled();
  });

  it('does not overwrite a live snapshot with an older refresh response', async () => {
    let resolveInitial!: (response: { success: true; data: MqttControlSnapshotDto }) => void;
    const initialRequest = new Promise<{ success: true; data: MqttControlSnapshotDto }>((resolve) => {
      resolveInitial = resolve;
    });
    getControlState.mockReturnValue(initialRequest);

    render(
      <EventBusProvider bus={eventBus}>
        <CompetitionControlScreen />
      </EventBusProvider>,
    );

    await waitFor(() => expect(eventHandlers.has('mqttControlStateChanged')).toBe(true));
    act(() => {
      eventHandlers.get('mqttControlStateChanged')!({
        ...completedSnapshot,
        connected: false,
      });
    });
    expect(screen.getByText('Disconnected')).toBeInTheDocument();

    await act(async () => {
      resolveInitial({ success: true, data: completedSnapshot });
      await initialRequest;
    });

    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('selects and operates independent competitions on disjoint Lane groups', async () => {
    const bpCompetition = {
      ...completedSnapshot.competitions[0]!,
      competitionTypeId: 'BP60' as const,
      competitionTypeName: 'BP60',
      discipline: 'BEAM_PISTOL_10M' as const,
      phase: 'MATCH' as const,
      finishedAt: null,
      publishedAt: '2026-08-26T01:00:00.000Z',
    };
    const brCompetition = {
      ...completedSnapshot.competitions[0]!,
      competitionId: SECOND_COMPETITION_ID,
      laneIds: [SECOND_LANE_ID],
      phase: 'SIGHTING_COMPLETE' as const,
      startedAt: '2026-08-26T01:10:00.000Z',
      finishedAt: null,
      publishedAt: '2026-08-26T01:20:00.000Z',
    };
    const snapshot: MqttControlSnapshotDto = {
      ...completedSnapshot,
      activeCompetitionId: COMPETITION_ID,
      competitions: [brCompetition, bpCompetition],
      lanes: [
        { ...completedSnapshot.lanes[0]!, laneAlias: 'Lane 1' },
        {
          ...completedSnapshot.lanes[0]!,
          laneId: SECOND_LANE_ID,
          laneAlias: 'Lane 5',
          firingPointNumber: 5,
        },
      ],
    };
    getControlState.mockResolvedValue({ success: true, data: snapshot });

    render(
      <EventBusProvider bus={eventBus}>
        <CompetitionControlScreen />
      </EventBusProvider>,
    );

    const competitionSelect = await screen.findByLabelText('Selected competition');
    await waitFor(() => expect(competitionSelect).toHaveValue(COMPETITION_ID));
    expect(screen.getByText(/BP60 · 1 Lanes · MATCH/)).toBeInTheDocument();
    expect(
      within(screen.getByRole('checkbox', { name: /Lane 1/ }).closest('tr')!).getByText('BP60'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('checkbox', { name: /Lane 5/ }).closest('tr')!).getByText('BR60S'),
    ).toBeInTheDocument();

    fireEvent.change(competitionSelect, { target: { value: SECOND_COMPETITION_ID } });

    expect(screen.getByText(/BR60S · 1 Lanes · SIGHTING COMPLETE/)).toBeInTheDocument();
  });

  it('creates a BR competition on free Lanes while a BP competition remains active', async () => {
    const bpCompetition = {
      ...completedSnapshot.competitions[0]!,
      competitionTypeId: 'BP60' as const,
      competitionTypeName: 'BP60',
      discipline: 'BEAM_PISTOL_10M' as const,
      phase: 'NOT_STARTED' as const,
      startedAt: null,
      finishedAt: null,
    };
    const secondLane = {
      ...completedSnapshot.lanes[0]!,
      laneId: SECOND_LANE_ID,
      laneAlias: 'Lane 5',
      firingPointNumber: 5,
    };
    const snapshot: MqttControlSnapshotDto = {
      ...completedSnapshot,
      competitions: [bpCompetition],
      lanes: [{ ...completedSnapshot.lanes[0]!, laneAlias: 'Lane 1' }, secondLane],
    };
    const brCompetition = {
      ...bpCompetition,
      competitionId: SECOND_COMPETITION_ID,
      competitionTypeId: 'BR60S' as const,
      competitionTypeName: 'BR60S',
      discipline: 'BEAM_RIFLE_10M' as const,
      laneIds: [],
      publishedAt: '2026-08-26T02:00:00.000Z',
    };
    getControlState.mockResolvedValue({ success: true, data: snapshot });
    createCompetition.mockResolvedValue({ success: true, data: brCompetition });
    joinCompetition.mockResolvedValue({
      success: true,
      data: {
        success: true,
        commands: [
          {
            commandId: '88888888-8888-4888-8888-888888888888',
            action: 'join-competition',
            success: true,
            lanes: [{ laneId: SECOND_LANE_ID, status: 'done' }],
          },
        ],
      },
    });

    render(
      <EventBusProvider bus={eventBus}>
        <CompetitionControlScreen />
      </EventBusProvider>,
    );

    fireEvent.click(await screen.findByRole('checkbox', { name: /Lane 5/ }));
    const createButton = screen.getByRole('button', { name: 'Create competition' });
    await waitFor(() => expect(createButton).toBeEnabled());
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(createCompetition).toHaveBeenCalledWith({
        competitionTypeId: 'BR60S',
        laneIds: [SECOND_LANE_ID],
      });
      expect(joinCompetition).toHaveBeenCalledWith({
        competitionId: SECOND_COMPETITION_ID,
        laneIds: [SECOND_LANE_ID],
      });
    });
  });

  it('retries only pending Lanes after a partial sighting start', async () => {
    const partialSightingSnapshot: MqttControlSnapshotDto = {
      ...completedSnapshot,
      competitions: [
        {
          ...completedSnapshot.competitions[0]!,
          phase: 'SIGHTING',
          laneIds: [LANE_ID, SECOND_LANE_ID],
          pendingSightingLaneIds: [SECOND_LANE_ID],
          finishedAt: null,
        },
      ],
      lanes: [
        completedSnapshot.lanes[0]!,
        {
          ...completedSnapshot.lanes[0]!,
          laneId: SECOND_LANE_ID,
          laneAlias: 'Lane 2',
          firingPointNumber: 2,
        },
      ],
      lastCommand: {
        commandId: '66666666-6666-4666-8666-666666666666',
        action: 'start-sighting',
        success: false,
        lanes: [
          { laneId: LANE_ID, status: 'done' },
          { laneId: SECOND_LANE_ID, status: 'timeout' },
        ],
      },
    };
    getControlState.mockResolvedValue({ success: true, data: partialSightingSnapshot });
    startSighting.mockResolvedValue({
      success: true,
      data: {
        commandId: '77777777-7777-4777-8777-777777777777',
        action: 'start-sighting',
        success: true,
        lanes: [{ laneId: SECOND_LANE_ID, status: 'done' }],
      },
    });

    render(
      <EventBusProvider bus={eventBus}>
        <CompetitionControlScreen />
      </EventBusProvider>,
    );

    const retryButton = await screen.findByRole('button', { name: 'Retry sighting for pending Lanes (1)' });
    expect(retryButton).toBeEnabled();
    expect(screen.getByRole('button', { name: 'End sighting' })).toBeDisabled();
    fireEvent.click(retryButton);

    await waitFor(() =>
      expect(startSighting).toHaveBeenCalledWith({
        competitionId: COMPETITION_ID,
        durationSeconds: 600,
        targetLaneIds: [SECOND_LANE_ID],
      }),
    );
  });

  it('blocks sighting and allows retrying an ambiguous Lane join', async () => {
    const pendingJoinSnapshot: MqttControlSnapshotDto = {
      ...completedSnapshot,
      competitions: [
        {
          ...completedSnapshot.competitions[0]!,
          phase: 'NOT_STARTED',
          pendingJoinLaneIds: [LANE_ID],
          startedAt: null,
          finishedAt: null,
        },
      ],
      lastCommand: null,
    };
    getControlState.mockResolvedValue({ success: true, data: pendingJoinSnapshot });
    joinCompetition.mockResolvedValue({
      success: true,
      data: {
        success: true,
        commands: [
          {
            commandId: '88888888-8888-4888-8888-888888888888',
            action: 'join-competition',
            success: true,
            lanes: [{ laneId: LANE_ID, status: 'done' }],
          },
        ],
      },
    });

    render(
      <EventBusProvider bus={eventBus}>
        <CompetitionControlScreen />
      </EventBusProvider>,
    );

    expect(await screen.findByText('JOIN PENDING')).toBeInTheDocument();
    expect(await screen.findByText(/1 Lane membership confirmation\(s\) are pending/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start sighting (10 min)' })).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Lane 1' }));
    const joinButton = screen.getByRole('button', { name: 'Join selected Lanes' });
    expect(joinButton).toBeEnabled();
    fireEvent.click(joinButton);

    await waitFor(() =>
      expect(joinCompetition).toHaveBeenCalledWith({
        competitionId: COMPETITION_ID,
        laneIds: [LANE_ID],
      }),
    );
  });

  it('surfaces successful Lane commands that include clock synchronization warnings', async () => {
    const readySnapshot: MqttControlSnapshotDto = {
      ...completedSnapshot,
      competitions: [
        {
          ...completedSnapshot.competitions[0]!,
          phase: 'NOT_STARTED',
          startedAt: null,
          finishedAt: null,
        },
      ],
      lastCommand: null,
    };
    const warningResult = {
      commandId: '99999999-9999-4999-8999-999999999999',
      action: 'start-sighting' as const,
      success: true,
      lanes: [{ laneId: LANE_ID, status: 'done' as const, warning: 'clock_drift_detected' }],
    };
    getControlState
      .mockResolvedValueOnce({ success: true, data: readySnapshot })
      .mockResolvedValue({ success: true, data: { ...readySnapshot, lastCommand: warningResult } });
    startSighting.mockResolvedValue({ success: true, data: warningResult });

    render(
      <EventBusProvider bus={eventBus}>
        <CompetitionControlScreen />
      </EventBusProvider>,
    );

    const startButton = await screen.findByRole('button', { name: 'Start sighting (10 min)' });
    await waitFor(() => expect(startButton).toBeEnabled());
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(useNotificationStore.getState().notifications.at(-1)).toMatchObject({
        type: 'warning',
        message: expect.stringContaining('clock_drift_detected'),
      });
    });
    expect(await screen.findByText(/clock_drift_detected/)).toBeInTheDocument();
  });

  it('locks membership controls after start except for a Lane still pending sighting', async () => {
    const partialSightingSnapshot: MqttControlSnapshotDto = {
      ...completedSnapshot,
      competitions: [
        {
          ...completedSnapshot.competitions[0]!,
          phase: 'SIGHTING',
          laneIds: [LANE_ID, SECOND_LANE_ID],
          pendingSightingLaneIds: [SECOND_LANE_ID],
          finishedAt: null,
        },
      ],
      lanes: [
        completedSnapshot.lanes[0]!,
        {
          ...completedSnapshot.lanes[0]!,
          laneId: SECOND_LANE_ID,
          laneAlias: 'Lane 2',
          firingPointNumber: 2,
        },
        {
          ...completedSnapshot.lanes[0]!,
          laneId: THIRD_LANE_ID,
          laneAlias: 'Lane 3',
          firingPointNumber: 3,
        },
      ],
    };
    getControlState.mockResolvedValue({ success: true, data: partialSightingSnapshot });
    leaveCompetition.mockResolvedValue({
      success: true,
      data: {
        success: true,
        commands: [
          {
            commandId: '77777777-7777-4777-8777-777777777777',
            action: 'leave-competition',
            success: true,
            lanes: [{ laneId: SECOND_LANE_ID, status: 'done' }],
          },
        ],
      },
    });

    render(
      <EventBusProvider bus={eventBus}>
        <CompetitionControlScreen />
      </EventBusProvider>,
    );

    const joinButton = await screen.findByRole('button', { name: 'Join selected Lanes' });
    const leaveButton = screen.getByRole('button', { name: 'Remove selected Lanes' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Lane 3' }));
    expect(joinButton).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Lane 1' }));
    expect(leaveButton).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Lane 1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Lane 2' }));
    expect(leaveButton).toBeEnabled();
    fireEvent.click(leaveButton);

    await waitFor(() =>
      expect(leaveCompetition).toHaveBeenCalledWith({
        competitionId: COMPETITION_ID,
        laneIds: [SECOND_LANE_ID],
      }),
    );
    expect(joinCompetition).not.toHaveBeenCalled();
  });

  it('preserves the tournament participant ID when manually correcting an assignment', async () => {
    useCompetitionControlStore.getState().setResultContext(COMPETITION_ID, {
      eventId: EVENT_ID,
      relayNumber: 1,
    });

    render(
      <EventBusProvider bus={eventBus}>
        <CompetitionControlScreen />
      </EventBusProvider>,
    );

    fireEvent.change(await screen.findByLabelText('Athlete name'), { target: { value: 'Alex Smith' } });
    const assignButton = screen.getByRole('button', { name: 'Assign athlete' });
    await waitFor(() => expect(assignButton).toBeEnabled());
    fireEvent.click(assignButton);

    await waitFor(() => {
      expect(getParticipants).toHaveBeenCalledWith({ eventId: EVENT_ID });
      expect(assignAthlete).toHaveBeenCalledWith({
        competitionId: COMPETITION_ID,
        laneId: LANE_ID,
        athlete: {
          id: PARTICIPANT_ID,
          startNumber: 1,
          name: 'Alex Smith',
          teamName: 'Tokyo',
        },
      });
    });
  });
});
