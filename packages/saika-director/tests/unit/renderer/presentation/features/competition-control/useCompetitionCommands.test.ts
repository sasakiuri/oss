import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCompetitionCommands } from '@/renderer/presentation/features/competition-control/useCompetitionCommands';
import { useCompetitionControlStore } from '@/renderer/presentation/stores/domain/competitionControl.store';
import { useNotificationStore } from '@/renderer/presentation/stores/ui/notifications.store';
import { championshipService, mqttService } from '@/renderer/services';

import { fail } from '../../../../../helpers/renderer/serviceResponses';

vi.mock('@/renderer/services', async () =>
  (await import('../../../../../helpers/renderer/mockServices')).mockServices(),
);

type Options = Parameters<typeof useCompetitionCommands>[0];

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const LANE_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';

function options(refresh: () => Promise<void>): Options {
  return {
    refresh,
    selection: {
      activeCompetition: { competitionId: COMPETITION_ID, phase: 'MATCH' } as unknown as NonNullable<
        Options['selection']['activeCompetition']
      >,
      activeCompetitionTiming: null,
      selectedAvailableLaneIds: [],
      competitionTypeId: 'AIR_RIFLE_60',
      setSelectedCompetitionId: vi.fn(),
      setSelectedLaneIds: vi.fn(),
      assignmentLaneId: LANE_ID,
      competitionLanes: [],
      pendingSightingLaneIds: [],
      canPublishResults: true,
      advanceSeriesSource: null,
    } as unknown as Options['selection'],
  };
}

function notifications() {
  return useNotificationStore.getState().notifications.map(({ type, message }) => ({ type, message }));
}

describe('useCompetitionCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useNotificationStore.setState({ notifications: [] });
    useCompetitionControlStore.getState().reset();
  });

  it('notifies a thrown error by its message and any other thrown value as text, then refreshes', async () => {
    const refresh = vi.fn(async () => {});
    vi.mocked(mqttService.endSighting)
      .mockRejectedValueOnce(new Error('Broker timeout'))
      .mockRejectedValueOnce('offline');
    const { result } = renderHook(() => useCompetitionCommands(options(refresh)));

    await act(() => result.current.endSighting());
    await act(() => result.current.endSighting());
    await act(() => result.current.advanceSeries());

    expect(notifications()).toEqual([
      { type: 'error', message: 'Broker timeout' },
      { type: 'error', message: 'offline' },
      { type: 'error', message: 'No completed series is available to advance' },
    ]);
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(result.current.busyAction).toBeNull();
  });

  it('notifies a failed participant lookup by its message and does not assign the athlete', async () => {
    useCompetitionControlStore.getState().setResultContext(COMPETITION_ID, { eventId: EVENT_ID, relayNumber: 1 });
    vi.mocked(championshipService.getParticipants).mockResolvedValue(fail('Event not found', 'NOT_FOUND'));
    const { result } = renderHook(() => useCompetitionCommands(options(async () => {})));
    act(() => result.current.setAthleteName('Athlete A'));

    await act(() => result.current.assignAthlete());

    expect(championshipService.getParticipants).toHaveBeenCalledWith({ eventId: EVENT_ID });
    expect(mqttService.assignAthlete).not.toHaveBeenCalled();
    expect(notifications()).toEqual([{ type: 'error', message: 'Event not found' }]);
  });
});
