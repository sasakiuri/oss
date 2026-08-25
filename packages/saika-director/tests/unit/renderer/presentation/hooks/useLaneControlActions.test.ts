import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const {
  mockSetLanes,
  mockUpdateLane,
  mockClearLanes,
  mockReset,
  mockGetAll,
  mockStartPreparation,
  mockAdvanceStage,
  mockStartSeries,
  mockFinish,
  mockClear,
  mockAssignPlayers,
  mockMoveLane,
  mockEditShot,
  mockDeleteShot,
  mockInsertShot,
  mockEliminate,
  mockGetScoreSheets,
  mockGetState,
  mockDeselectAll,
  mockPruneSelection,
} = vi.hoisted(() => ({
  mockSetLanes: vi.fn(),
  mockUpdateLane: vi.fn(),
  mockClearLanes: vi.fn(),
  mockReset: vi.fn(),
  mockGetAll: vi.fn(),
  mockStartPreparation: vi.fn(),
  mockAdvanceStage: vi.fn(),
  mockStartSeries: vi.fn(),
  mockFinish: vi.fn(),
  mockClear: vi.fn(),
  mockAssignPlayers: vi.fn(),
  mockMoveLane: vi.fn(),
  mockEditShot: vi.fn(),
  mockDeleteShot: vi.fn(),
  mockInsertShot: vi.fn(),
  mockEliminate: vi.fn(),
  mockGetScoreSheets: vi.fn(),
  mockGetState: vi.fn(() => ({ lanes: new Map() })),
  mockDeselectAll: vi.fn(),
  mockPruneSelection: vi.fn(),
}));

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
vi.mock('@/renderer/presentation/stores/domain/laneControl.store', () => {
  const hook = (selector: (state: Record<string, unknown>) => unknown) => {
    const mockState = {
      setLanes: mockSetLanes,
      updateLane: mockUpdateLane,
      clearLanes: mockClearLanes,
      reset: mockReset,
    };
    return selector(mockState);
  };
  (hook as unknown as Record<string, unknown>).getState = mockGetState;
  return { useLaneControlStore: hook };
});

// --- Mock: Selection Store ---
vi.mock('@/renderer/presentation/stores/ui/selection.store', () => {
  const hook = vi.fn();
  (hook as unknown as Record<string, unknown>).getState = vi.fn(() => ({
    deselectAll: mockDeselectAll,
    pruneSelection: mockPruneSelection,
  }));
  return { useSelectionStore: hook };
});

// --- Mock: Service ---
vi.mock('@/renderer/services', () => ({
  laneControlService: {
    getAll: mockGetAll,
    startPreparation: mockStartPreparation,
    advanceStage: mockAdvanceStage,
    startSeries: mockStartSeries,
    finish: mockFinish,
    clear: mockClear,
    assignPlayers: mockAssignPlayers,
    moveLane: mockMoveLane,
    editShot: mockEditShot,
    deleteShot: mockDeleteShot,
    insertShot: mockInsertShot,
    eliminate: mockEliminate,
    getScoreSheets: mockGetScoreSheets,
  },
}));

import { useLaneControlActions } from '@/renderer/presentation/hooks/useLaneControlActions';

function createSampleResponseData() {
  return {
    id: 'lane-1',
    channel: 1,
    player: { name: 'Alex Smith', affiliation: 'Test Association', participantId: 'p-1' },
    phase: 'IDLE',
    remainingTime: 600,
    shotNumber: 0,
    lastScore: null,
    lastShotTime: null,
    seriesScores: [],
    totalScore: 0,
    recentShots: [],
    unifiedPhase: 'IDLE',
    stageIndex: 0,
    seriesIndex: 0,
    roundType: 'Qualification',
    stageName: '',
    stage1Total: 0,
    stage2Total: 0,
    eliminated: false,
    eliminationRank: null,
    relayNumber: 1,
  };
}

describe('useLaneControlActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadState', () => {
    it('calls the service and sets DTOs with setLanes on success', async () => {
      const sampleData = createSampleResponseData();
      mockGetAll.mockResolvedValue({
        success: true,
        data: [sampleData],
      });

      const { result } = renderHook(() => useLaneControlActions());

      await act(async () => {
        await result.current.loadState();
      });

      expect(mockGetAll).toHaveBeenCalledOnce();
      expect(mockSetLanes).toHaveBeenCalledOnce();

      const dtos = mockSetLanes.mock.calls[0]![0];
      expect(dtos).toHaveLength(1);
      expect(dtos[0]).toEqual({
        id: 'lane-1',
        channel: 1,
        playerName: 'Alex Smith',
        affiliation: 'Test Association',
        participantId: 'p-1',
        phase: 'IDLE',
        remainingTime: 600,
        shotNumber: 0,
        lastScore: null,
        lastShotTime: null,
        seriesScores: [],
        totalScore: 0,
        recentShots: [],
        unifiedPhase: 'IDLE',
        stageIndex: 0,
        seriesIndex: 0,
        roundType: 'Qualification',
        stageName: '',
        stage1Total: 0,
        stage2Total: 0,
        eliminated: false,
        eliminationRank: null,
        relayNumber: 1,
      });
    });

    it('does not call setLanes when the response is unsuccessful', async () => {
      mockGetAll.mockResolvedValue({ success: false, error: 'some error' });

      const { result } = renderHook(() => useLaneControlActions());

      await act(async () => {
        await result.current.loadState();
      });

      expect(mockGetAll).toHaveBeenCalledOnce();
      expect(mockSetLanes).not.toHaveBeenCalled();
    });

    it('maps playerName and affiliation to null when player is null', async () => {
      const sampleData = { ...createSampleResponseData(), player: null };
      mockGetAll.mockResolvedValue({
        success: true,
        data: [sampleData],
      });

      const { result } = renderHook(() => useLaneControlActions());

      await act(async () => {
        await result.current.loadState();
      });

      const dtos = mockSetLanes.mock.calls[0]![0];
      expect(dtos[0].playerName).toBeNull();
      expect(dtos[0].affiliation).toBeNull();
      expect(dtos[0].participantId).toBeUndefined();
    });
  });

  describe('startPreparation', () => {
    it('calls loadState on success', async () => {
      mockStartPreparation.mockResolvedValue({ success: true });
      mockGetAll.mockResolvedValue({ success: true, data: [] });

      const { result } = renderHook(() => useLaneControlActions());

      await act(async () => {
        await result.current.startPreparation(['lane-1', 'lane-2']);
      });

      expect(mockStartPreparation).toHaveBeenCalledWith({ laneIds: ['lane-1', 'lane-2'] });
      expect(mockGetAll).toHaveBeenCalled();
    });

    it('does not call loadState on failure', async () => {
      mockStartPreparation.mockResolvedValue({ success: false });

      const { result } = renderHook(() => useLaneControlActions());

      await act(async () => {
        await result.current.startPreparation(['lane-1']);
      });

      expect(mockStartPreparation).toHaveBeenCalledOnce();
      expect(mockGetAll).not.toHaveBeenCalled();
    });
  });

  describe('finish', () => {
    it('calls loadState on success', async () => {
      mockFinish.mockResolvedValue({ success: true });
      mockGetAll.mockResolvedValue({ success: true, data: [] });

      const { result } = renderHook(() => useLaneControlActions());

      await act(async () => {
        await result.current.finish(['lane-1']);
      });

      expect(mockFinish).toHaveBeenCalledWith({ laneIds: ['lane-1'] });
      expect(mockGetAll).toHaveBeenCalled();
    });
  });

  describe('clearLanes', () => {
    it('calls loadState on success', async () => {
      mockClear.mockResolvedValue({ success: true });
      mockGetAll.mockResolvedValue({ success: true, data: [] });

      const { result } = renderHook(() => useLaneControlActions());

      await act(async () => {
        await result.current.clearLanes(['lane-1']);
      });

      expect(mockClear).toHaveBeenCalledWith({ laneIds: ['lane-1'] });
      expect(mockGetAll).toHaveBeenCalled();
    });
  });

  describe('editShot', () => {
    it('calls the service with the correct payload', async () => {
      const payload = {
        laneId: 'lane-1',
        shotIndex: 3,
        newScore: 10,
        shotType: 'MATCH' as const,
      };
      mockEditShot.mockResolvedValue({ success: true });
      mockGetAll.mockResolvedValue({ success: true, data: [] });

      const { result } = renderHook(() => useLaneControlActions());

      await act(async () => {
        await result.current.editShot(payload);
      });

      expect(mockEditShot).toHaveBeenCalledWith(payload);
    });
  });

  describe('moveLane', () => {
    it('calls the service with the correct arguments', async () => {
      mockMoveLane.mockResolvedValue({ success: true });
      mockGetAll.mockResolvedValue({ success: true, data: [] });

      const { result } = renderHook(() => useLaneControlActions());

      await act(async () => {
        await result.current.moveLane('lane-1', 'lane-2');
      });

      expect(mockMoveLane).toHaveBeenCalledWith({ fromLaneId: 'lane-1', toLaneId: 'lane-2' });
    });
  });

  describe('assignPlayers', () => {
    it('calls the service with the correct payload', async () => {
      const payload = {
        eventType: 'BR60S',
        assignments: [
          {
            channel: 1,
            playerName: 'Alex Smith',
            affiliation: 'Test Association',
            participantId: 'p-1',
          },
        ],
      };
      mockAssignPlayers.mockResolvedValue({ success: true });
      mockGetAll.mockResolvedValue({ success: true, data: [] });

      const { result } = renderHook(() => useLaneControlActions());

      await act(async () => {
        await result.current.assignPlayers(payload);
      });

      expect(mockAssignPlayers).toHaveBeenCalledWith(payload);
    });
  });

  describe('eliminate', () => {
    it('calls the service with the correct arguments', async () => {
      mockEliminate.mockResolvedValue({ success: true });
      mockGetAll.mockResolvedValue({ success: true, data: [] });

      const { result } = renderHook(() => useLaneControlActions());

      await act(async () => {
        await result.current.eliminate('lane-1', 3);
      });

      expect(mockEliminate).toHaveBeenCalledWith({ laneId: 'lane-1', rank: 3 });
    });
  });

  describe('Store actions', () => {
    it('returns setLanes, updateLane, clearLanesStore, and reset', () => {
      const { result } = renderHook(() => useLaneControlActions());

      // setLanes and updateLane are still direct references
      expect(result.current.setLanes).toBe(mockSetLanes);
      expect(result.current.updateLane).toBe(mockUpdateLane);
      // clearLanesStore and reset are now wrapped callbacks
      expect(typeof result.current.clearLanesStore).toBe('function');
      expect(typeof result.current.reset).toBe('function');

      // Verify clearLanesStore calls both store and selection
      act(() => {
        result.current.clearLanesStore();
      });
      expect(mockClearLanes).toHaveBeenCalled();
      expect(mockDeselectAll).toHaveBeenCalled();
    });
  });
});
