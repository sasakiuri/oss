import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLaneControlEvents } from '@/renderer/presentation/hooks/useLaneControlEvents';
import { useLaneControlStore } from '@/renderer/presentation/stores/domain/laneControl.store';

// Suppress Logger output in tests
vi.mock('@/shared/utils/Logger', () => ({
  Logger: {
    create: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

// ---------------------------------------------------------------------------
// Mock useEvent to capture event handlers
// ---------------------------------------------------------------------------

type EventCallback = (data: unknown) => void | Promise<void>;
const capturedHandlers = new Map<string, EventCallback>();

vi.mock('@/renderer/presentation/hooks/useEvent', () => ({
  useEvent: (event: string, handler: EventCallback) => {
    capturedHandlers.set(event, handler);
  },
}));

// ---------------------------------------------------------------------------
// Mock selection store (used by laneControl store internally)
// ---------------------------------------------------------------------------

vi.mock('@/renderer/presentation/stores/ui/selection.store', () => ({
  useSelectionStore: Object.assign(() => ({ selectedIds: new Set() }), {
    getState: () => ({
      pruneSelection: vi.fn(),
      deselectAll: vi.fn(),
    }),
  }),
}));

describe('useLaneControlEvents', () => {
  let loadState: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedHandlers.clear();
    loadState = vi.fn().mockResolvedValue(undefined);

    // Reset the store to initial state
    useLaneControlStore.setState({
      lanes: new Map(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Helper to render the hook and return the captured event handlers.
   */
  function renderLaneControlEvents() {
    renderHook(() => useLaneControlEvents(loadState));
    return {
      fireEvent: async (eventName: string, data: unknown) => {
        const handler = capturedHandlers.get(eventName);
        if (!handler) throw new Error(`No handler captured for event: ${eventName}`);
        await act(async () => {
          await handler(data);
        });
      },
    };
  }

  /**
   * Helper to seed the store with a lane.
   */
  function seedLane(overrides: Record<string, unknown> = {}) {
    const lane = {
      id: 'lane-1',
      channel: 1,
      playerName: 'Test Player',
      affiliation: 'Club A',
      participantId: 'participant-1',
      phase: 'IDLE' as const,
      remainingTime: 0,
      shotNumber: 0,
      lastScore: null,
      lastShotTime: null,
      seriesScores: [],
      totalScore: 0,
      recentShots: [],
      unifiedPhase: 'IDLE',
      stageIndex: 0,
      roundType: 'Qualification' as const,
      stageName: '',
      seriesIndex: 0,
      stage1Total: 0,
      stage2Total: 0,
      eliminated: false,
      eliminationRank: null,
      relayNumber: 1,
      ...overrides,
    };
    useLaneControlStore.getState().setLanes([lane]);
    return lane;
  }

  describe('laneControlUpdated event', () => {
    it('should update lane state with full event data', async () => {
      seedLane();
      const { fireEvent } = renderLaneControlEvents();

      await fireEvent('laneControlUpdated', {
        laneId: 'lane-1',
        channel: 1,
        playerName: 'Updated Player',
        affiliation: 'Club B',
        participantId: 'participant-2',
        relayNumber: 2,
        phase: 'ACTIVE',
        remainingTime: 120,
        shotNumber: 5,
        lastScore: 10.5,
        lastShotTime: 1234567890,
        seriesScores: [50, 48],
        totalScore: 98,
        recentShots: [10.5, 10.2],
        unifiedPhase: 'ACTIVE',
        stageIndex: 1,
        roundType: 'Qualification',
        stageName: 'Series 1',
        seriesIndex: 0,
        stage1Total: 50,
        stage2Total: 0,
        eliminated: false,
        eliminationRank: null,
      });

      const lane = useLaneControlStore.getState().getLaneById('lane-1');
      expect(lane).toBeDefined();
      expect(lane!.playerName).toBe('Updated Player');
      expect(lane!.affiliation).toBe('Club B');
      expect(lane!.participantId).toBe('participant-2');
      expect(lane!.relayNumber).toBe(2);
      expect(lane!.phase).toBe('ACTIVE');
      expect(lane!.totalScore).toBe(98);
      expect(lane!.unifiedPhase).toBe('ACTIVE');
    });

    it('should preserve existing assignment metadata for legacy event data', async () => {
      seedLane({ participantId: 'participant-3', relayNumber: 3 });
      const { fireEvent } = renderLaneControlEvents();

      await fireEvent('laneControlUpdated', {
        laneId: 'lane-1',
        channel: 1,
        playerName: 'Player',
        affiliation: null,
        phase: 'ACTIVE',
        remainingTime: 100,
        shotNumber: 1,
        lastScore: null,
        lastShotTime: null,
        seriesScores: [],
        totalScore: 0,
        recentShots: [],
        unifiedPhase: 'ACTIVE',
        stageIndex: 0,
        roundType: 'Qualification',
        stageName: '',
        seriesIndex: 0,
        stage1Total: 0,
        stage2Total: 0,
        eliminated: false,
        eliminationRank: null,
      });

      const lane = useLaneControlStore.getState().getLaneById('lane-1');
      expect(lane!.participantId).toBe('participant-3');
      expect(lane!.relayNumber).toBe(3);
    });
  });

  describe('laneControlPatched event', () => {
    it('should apply patch to existing lane', async () => {
      seedLane({ totalScore: 50 });
      const { fireEvent } = renderLaneControlEvents();

      // First patch sets lastSeqRef
      await fireEvent('laneControlPatched', {
        laneId: 'lane-1',
        seq: 1,
        patch: { totalScore: 60 },
      });

      const lane = useLaneControlStore.getState().getLaneById('lane-1');
      expect(lane!.totalScore).toBe(60);
    });

    it('should clear participant metadata and update relay number from a patch', async () => {
      seedLane({ participantId: 'participant-1', relayNumber: 1 });
      const { fireEvent } = renderLaneControlEvents();

      await fireEvent('laneControlPatched', {
        laneId: 'lane-1',
        seq: 1,
        patch: { participantId: null, relayNumber: 2 },
      });

      const lane = useLaneControlStore.getState().getLaneById('lane-1');
      expect(lane!.participantId).toBeUndefined();
      expect(lane!.relayNumber).toBe(2);
    });

    it('should trigger full sync on sequence gap', async () => {
      seedLane();
      const { fireEvent } = renderLaneControlEvents();

      // First patch establishes sequence baseline
      await fireEvent('laneControlPatched', {
        laneId: 'lane-1',
        seq: 1,
        patch: { totalScore: 10 },
      });

      // Sequence gap: expected 2, received 5
      await fireEvent('laneControlPatched', {
        laneId: 'lane-1',
        seq: 5,
        patch: { totalScore: 50 },
      });

      expect(loadState).toHaveBeenCalledTimes(1);
    });

    it('should NOT trigger full sync when sequence is continuous', async () => {
      seedLane();
      const { fireEvent } = renderLaneControlEvents();

      await fireEvent('laneControlPatched', {
        laneId: 'lane-1',
        seq: 1,
        patch: { totalScore: 10 },
      });

      await fireEvent('laneControlPatched', {
        laneId: 'lane-1',
        seq: 2,
        patch: { totalScore: 20 },
      });

      expect(loadState).not.toHaveBeenCalled();

      const lane = useLaneControlStore.getState().getLaneById('lane-1');
      expect(lane!.totalScore).toBe(20);
    });

    it('should track patch sequences independently for each lane', async () => {
      const firstLane = seedLane();
      const secondLane = { ...firstLane, id: 'lane-2', channel: 2 };
      useLaneControlStore.getState().setLanes([firstLane, secondLane]);
      const { fireEvent } = renderLaneControlEvents();

      await fireEvent('laneControlPatched', {
        laneId: 'lane-1',
        seq: 1,
        patch: { totalScore: 10 },
      });
      await fireEvent('laneControlPatched', {
        laneId: 'lane-2',
        seq: 1,
        patch: { totalScore: 20 },
      });

      expect(loadState).not.toHaveBeenCalled();
      expect(useLaneControlStore.getState().getLaneById('lane-1')!.totalScore).toBe(10);
      expect(useLaneControlStore.getState().getLaneById('lane-2')!.totalScore).toBe(20);
    });

    it('should trigger full sync when lane is not found during patch', async () => {
      // Do NOT seed any lanes
      const { fireEvent } = renderLaneControlEvents();

      // Patch for a non-existent lane with unified fields
      await fireEvent('laneControlPatched', {
        laneId: 'non-existent',
        seq: 1,
        patch: { unifiedPhase: 'ACTIVE', totalScore: 10 },
      });

      expect(loadState).toHaveBeenCalledTimes(1);
    });

    it('should skip patch when lane does not exist and no unified fields in patch', async () => {
      // No lane seeded, and the patch has no unifiedPhase/stageIndex fields
      const { fireEvent } = renderLaneControlEvents();

      await fireEvent('laneControlPatched', {
        laneId: 'non-existent',
        seq: 1,
        patch: { totalScore: 10 },
      });

      // Should not trigger full sync because it returns early
      expect(loadState).not.toHaveBeenCalled();
    });
  });

  describe('laneTimerTick event', () => {
    it('should update lane timer', async () => {
      seedLane({ remainingTime: 120, phase: 'MATCH' });
      const { fireEvent } = renderLaneControlEvents();

      await fireEvent('laneTimerTick', {
        laneId: 'lane-1',
        remainingTime: 119,
        phase: 'MATCH',
      });

      const lane = useLaneControlStore.getState().getLaneById('lane-1');
      expect(lane!.remainingTime).toBe(119);
    });

    it('should trigger full sync if lane not found during timer tick', async () => {
      // No lane seeded
      const { fireEvent } = renderLaneControlEvents();

      await fireEvent('laneTimerTick', {
        laneId: 'non-existent',
        remainingTime: 100,
        phase: 'MATCH',
      });

      expect(loadState).toHaveBeenCalledTimes(1);
    });
  });

  describe('laneTimerExpired event', () => {
    it('should set remaining time to 0 on timer expiry', async () => {
      seedLane({ remainingTime: 10, phase: 'MATCH' });
      const { fireEvent } = renderLaneControlEvents();

      await fireEvent('laneTimerExpired', {
        laneId: 'lane-1',
        phase: 'MATCH',
      });

      const lane = useLaneControlStore.getState().getLaneById('lane-1');
      expect(lane!.remainingTime).toBe(0);
    });

    it('should trigger full sync if lane not found during timer expired', async () => {
      const { fireEvent } = renderLaneControlEvents();

      await fireEvent('laneTimerExpired', {
        laneId: 'non-existent',
        phase: 'MATCH',
      });

      expect(loadState).toHaveBeenCalledTimes(1);
    });
  });
});
