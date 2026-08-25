import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const {
  mockStoreState,
  mockGetChampionships,
  mockGetChampionshipDetail,
  mockGetParticipants,
  mockGetFiringPointAssignments,
  mockCreateChampionship,
  mockUpdateChampionship,
  mockDeleteChampionship,
  mockCreateEvent,
  mockUpdateEvent,
  mockDeleteEvent,
  mockSaveParticipants,
  mockSaveFiringPointAssignments,
} = vi.hoisted(() => {
  const state = {
    setChampionships: vi.fn(),
    setSelectedChampionship: vi.fn(),
    setSelectedEventId: vi.fn(),
    setParticipants: vi.fn(),
    setFiringPointAssignments: vi.fn(),
    reset: vi.fn(),
    selectedChampionship: null as { id: string } | null,
    selectedEventId: null as string | null,
  };
  return {
    mockStoreState: state,
    mockGetChampionships: vi.fn(),
    mockGetChampionshipDetail: vi.fn(),
    mockGetParticipants: vi.fn(),
    mockGetFiringPointAssignments: vi.fn(),
    mockCreateChampionship: vi.fn(),
    mockUpdateChampionship: vi.fn(),
    mockDeleteChampionship: vi.fn(),
    mockCreateEvent: vi.fn(),
    mockUpdateEvent: vi.fn(),
    mockDeleteEvent: vi.fn(),
    mockSaveParticipants: vi.fn(),
    mockSaveFiringPointAssignments: vi.fn(),
  };
});

// --- Mock: Logger ---
vi.mock('@/shared/utils/Logger', () => ({
  Logger: {
    create: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      logError: vi.fn(),
      userAction: vi.fn(),
      startTimer: vi.fn(),
    }),
  },
}));

// --- Mock: Store ---
vi.mock('@/renderer/presentation/stores/domain/championship.store', () => {
  const mockUseChampionshipStore = Object.assign(
    (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState),
    { getState: () => mockStoreState },
  );
  return { useChampionshipStore: mockUseChampionshipStore };
});

// --- Mock: Service ---
vi.mock('@/renderer/services', () => ({
  championshipService: {
    getChampionships: mockGetChampionships,
    getChampionshipDetail: mockGetChampionshipDetail,
    getParticipants: mockGetParticipants,
    getFiringPointAssignments: mockGetFiringPointAssignments,
    createChampionship: mockCreateChampionship,
    updateChampionship: mockUpdateChampionship,
    deleteChampionship: mockDeleteChampionship,
    createEvent: mockCreateEvent,
    updateEvent: mockUpdateEvent,
    deleteEvent: mockDeleteEvent,
    saveParticipants: mockSaveParticipants,
    saveFiringPointAssignments: mockSaveFiringPointAssignments,
  },
}));

import { useChampionshipActions } from '@/renderer/presentation/hooks/useChampionshipActions';

describe('useChampionshipActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState.selectedChampionship = null;
    mockStoreState.selectedEventId = null;
  });

  describe('loadChampionships', () => {
    it('calls the service and updates the store', async () => {
      const championships = [{ id: 'c-1', name: 'National Championship' }];
      mockGetChampionships.mockResolvedValue({ success: true, data: { championships } });

      const { result } = renderHook(() => useChampionshipActions());

      await act(async () => {
        await result.current.loadChampionships();
      });

      expect(mockGetChampionships).toHaveBeenCalledOnce();
      expect(mockStoreState.setChampionships).toHaveBeenCalledWith(championships);
    });
  });

  describe('loadChampionshipDetail', () => {
    it('calls the service by ID and updates the store', async () => {
      const detail = { id: 'c-1', name: 'National Championship', events: [] };
      mockGetChampionshipDetail.mockResolvedValue({ success: true, data: detail });

      const { result } = renderHook(() => useChampionshipActions());

      await act(async () => {
        await result.current.loadChampionshipDetail('c-1');
      });

      expect(mockGetChampionshipDetail).toHaveBeenCalledWith({ id: 'c-1' });
      expect(mockStoreState.setSelectedChampionship).toHaveBeenCalledWith(detail);
    });

    it('discards a stale response received after clearing the selection', async () => {
      let resolveRequest!: (value: unknown) => void;
      mockGetChampionshipDetail.mockReturnValue(
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
      );
      const { result } = renderHook(() => useChampionshipActions());
      const request = result.current.loadChampionshipDetail('c-1');

      act(() => result.current.setSelectedChampionship(null));
      await act(async () => {
        resolveRequest({ success: true, data: { id: 'c-1', name: 'Stale Championship', events: [] } });
        await request;
      });

      expect(mockStoreState.setSelectedChampionship).toHaveBeenCalledOnce();
      expect(mockStoreState.setSelectedChampionship).toHaveBeenCalledWith(null);
    });

    it('does not apply a response received after unmounting', async () => {
      let resolveRequest!: (value: unknown) => void;
      mockGetChampionshipDetail.mockReturnValue(
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
      );
      const { result, unmount } = renderHook(() => useChampionshipActions());
      const request = result.current.loadChampionshipDetail('c-1');

      unmount();
      await act(async () => {
        resolveRequest({ success: true, data: { id: 'c-1', name: 'Stale Championship', events: [] } });
        await request;
      });

      expect(mockStoreState.setSelectedChampionship).not.toHaveBeenCalled();
    });
  });

  describe('loadParticipants', () => {
    it('calls the service by eventId and updates the store', async () => {
      const participants = [{ id: 'p-1', name: 'Alex Smith' }];
      mockGetParticipants.mockResolvedValue({ success: true, data: { participants } });
      mockStoreState.selectedEventId = 'event-1';

      const { result } = renderHook(() => useChampionshipActions());

      await act(async () => {
        await result.current.loadParticipants('event-1');
      });

      expect(mockGetParticipants).toHaveBeenCalledWith({ eventId: 'event-1' });
      expect(mockStoreState.setParticipants).toHaveBeenCalledWith(participants);
    });

    it('discards a stale participant response after the selected event changes', async () => {
      let resolveRequest!: (value: unknown) => void;
      mockStoreState.selectedEventId = 'event-1';
      mockGetParticipants.mockReturnValue(
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
      );
      const { result } = renderHook(() => useChampionshipActions());
      const request = result.current.loadParticipants('event-1');

      mockStoreState.selectedEventId = 'event-2';
      await act(async () => {
        resolveRequest({ success: true, data: { participants: [{ id: 'old' }] } });
        await request;
      });

      expect(mockStoreState.setParticipants).not.toHaveBeenCalled();
    });
  });

  describe('loadFiringPointAssignments', () => {
    it('discards a stale assignment response after the selected event changes', async () => {
      let resolveRequest!: (value: unknown) => void;
      mockStoreState.selectedEventId = 'event-1';
      mockGetFiringPointAssignments.mockReturnValue(
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
      );
      const { result } = renderHook(() => useChampionshipActions());
      const request = result.current.loadFiringPointAssignments('event-1');

      mockStoreState.selectedEventId = 'event-2';
      await act(async () => {
        resolveRequest({ success: true, data: { assignments: [{ id: 'old' }] } });
        await request;
      });

      expect(mockStoreState.setFiringPointAssignments).not.toHaveBeenCalled();
    });
  });

  describe('createChampionship', () => {
    it('calls loadChampionships after success', async () => {
      mockCreateChampionship.mockResolvedValue({ success: true, id: 'c-new' });
      mockGetChampionships.mockResolvedValue({ success: true, data: { championships: [] } });

      const payload = { name: 'New Championship', venue: 'Tokyo', date: '2026-03-01' };
      const { result } = renderHook(() => useChampionshipActions());

      await act(async () => {
        await result.current.createChampionship(payload as any);
      });

      expect(mockCreateChampionship).toHaveBeenCalledWith(payload);
      expect(mockGetChampionships).toHaveBeenCalledOnce();
    });

    it('does not call loadChampionships after failure', async () => {
      mockCreateChampionship.mockResolvedValue({ success: false, error: 'validation error' });

      const payload = { name: '', venue: '', date: '' };
      const { result } = renderHook(() => useChampionshipActions());

      await act(async () => {
        await result.current.createChampionship(payload as any);
      });

      expect(mockCreateChampionship).toHaveBeenCalledOnce();
      expect(mockGetChampionships).not.toHaveBeenCalled();
    });
  });

  describe('updateChampionship', () => {
    it('calls loadChampionships and loadDetail after success', async () => {
      mockStoreState.selectedChampionship = { id: 'c-1' };
      mockUpdateChampionship.mockResolvedValue({ success: true });
      mockGetChampionships.mockResolvedValue({ success: true, data: { championships: [] } });
      mockGetChampionshipDetail.mockResolvedValue({ success: true, data: { id: 'c-1', name: 'Updated' } });

      const payload = { id: 'c-1', name: 'Updated' };
      const { result } = renderHook(() => useChampionshipActions());

      await act(async () => {
        await result.current.updateChampionship(payload as any);
      });

      expect(mockUpdateChampionship).toHaveBeenCalledWith(payload);
      expect(mockGetChampionships).toHaveBeenCalledOnce();
      expect(mockGetChampionshipDetail).toHaveBeenCalledWith({ id: 'c-1' });
    });
  });

  describe('deleteChampionship', () => {
    it('calls loadChampionships and clears the selection after success', async () => {
      mockStoreState.selectedChampionship = { id: 'c-1' };
      mockDeleteChampionship.mockResolvedValue({ success: true });
      mockGetChampionships.mockResolvedValue({ success: true, data: { championships: [] } });

      const { result } = renderHook(() => useChampionshipActions());

      await act(async () => {
        await result.current.deleteChampionship('c-1');
      });

      expect(mockDeleteChampionship).toHaveBeenCalledWith({ id: 'c-1' });
      expect(mockGetChampionships).toHaveBeenCalledOnce();
      expect(mockStoreState.setSelectedChampionship).toHaveBeenCalledWith(null);
    });
  });

  describe('createEvent', () => {
    it('calls loadChampionshipDetail after success', async () => {
      mockCreateEvent.mockResolvedValue({ success: true, id: 'e-new' });
      mockGetChampionshipDetail.mockResolvedValue({ success: true, data: { id: 'c-1', events: [] } });

      const payload = { championshipId: 'c-1', name: 'BR60S', type: 'BR60S' };
      const { result } = renderHook(() => useChampionshipActions());

      await act(async () => {
        await result.current.createEvent(payload as any);
      });

      expect(mockCreateEvent).toHaveBeenCalledWith(payload);
      expect(mockGetChampionshipDetail).toHaveBeenCalledWith({ id: 'c-1' });
    });
  });

  describe('deleteEvent', () => {
    it('reloads the current championship details after success', async () => {
      mockStoreState.selectedChampionship = { id: 'c-1' };
      mockDeleteEvent.mockResolvedValue({ success: true });
      mockGetChampionshipDetail.mockResolvedValue({ success: true, data: { id: 'c-1', events: [] } });

      const { result } = renderHook(() => useChampionshipActions());

      await act(async () => {
        await result.current.deleteEvent('event-1');
      });

      expect(mockDeleteEvent).toHaveBeenCalledWith({ id: 'event-1' });
      expect(mockGetChampionshipDetail).toHaveBeenCalledWith({ id: 'c-1' });
    });
  });

  describe('saveParticipants', () => {
    it('stores participants returned by a successful command', async () => {
      const participants = [{ id: 'p-1', playerName: 'Alex Smith' }];
      mockStoreState.selectedEventId = 'event-1';
      mockSaveParticipants.mockResolvedValue({ success: true, data: { participants } });

      const payload = { eventId: 'event-1', participants: [{ name: 'Alex Smith' }] };
      const { result } = renderHook(() => useChampionshipActions());

      await act(async () => {
        await result.current.saveParticipants(payload as any);
      });

      expect(mockSaveParticipants).toHaveBeenCalledWith(payload);
      expect(mockStoreState.setParticipants).toHaveBeenCalledWith(participants);
      expect(mockGetParticipants).not.toHaveBeenCalled();
    });
  });

  describe('saveFiringPointAssignments', () => {
    it('stores firing-point assignments returned by a successful command', async () => {
      const assignments = [{ id: 'a-1', relayNumber: 1, firingPointNumber: 1, participantId: 'p-1' }];
      mockStoreState.selectedEventId = 'event-1';
      mockSaveFiringPointAssignments.mockResolvedValue({ success: true, data: { assignments } });

      const payload = { eventId: 'event-1', assignments: [{ channel: 1, participantId: 'p-1' }] };
      const { result } = renderHook(() => useChampionshipActions());

      await act(async () => {
        await result.current.saveFiringPointAssignments(payload as any);
      });

      expect(mockSaveFiringPointAssignments).toHaveBeenCalledWith(payload);
      expect(mockStoreState.setFiringPointAssignments).toHaveBeenCalledWith(assignments);
      expect(mockGetFiringPointAssignments).not.toHaveBeenCalled();
    });
  });

  describe('Store actions', () => {
    it('returns the expected store actions', () => {
      const { result } = renderHook(() => useChampionshipActions());

      act(() => result.current.setSelectedChampionship(null));
      expect(mockStoreState.setSelectedChampionship).toHaveBeenCalledWith(null);
      expect(result.current.setSelectedEventId).toBe(mockStoreState.setSelectedEventId);
      expect(result.current.setParticipants).toBe(mockStoreState.setParticipants);
      expect(result.current.setFiringPointAssignments).toBe(mockStoreState.setFiringPointAssignments);
      expect(result.current.reset).toBe(mockStoreState.reset);
    });
  });
});
