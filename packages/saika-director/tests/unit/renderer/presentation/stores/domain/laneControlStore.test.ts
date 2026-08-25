import { describe, it, expect, beforeEach } from 'vitest';
import { useLaneControlStore, type LaneControlDto } from '@/renderer/presentation/stores/domain/laneControl.store';
import { useSelectionStore } from '@/renderer/presentation/stores/ui/selection.store';

/**
 * Helper to create a LaneControlDto for testing
 */
function createLaneDto(overrides: Partial<LaneControlDto> = {}): LaneControlDto {
  return {
    id: 'lane-1',
    channel: 1,
    playerName: 'Player 1',
    affiliation: 'Team A',
    participantId: 'p1',
    phase: 'IDLE',
    remainingTime: 0,
    shotNumber: 0,
    lastScore: null,
    lastShotTime: null,
    seriesScores: [],
    totalScore: 0,
    recentShots: [],
    unifiedPhase: 'idle',
    stageIndex: 0,
    roundType: 'Qualification',
    stageName: 'Stage1',
    seriesIndex: 0,
    stage1Total: 0,
    stage2Total: 0,
    eliminated: false,
    eliminationRank: null,
    relayNumber: 1,
    ...overrides,
  };
}

describe('useLaneControlStore', () => {
  beforeEach(() => {
    useLaneControlStore.getState().reset();
    useSelectionStore.getState().deselectAll();
  });

  describe('initial state', () => {
    it('should have empty lanes map', () => {
      const state = useLaneControlStore.getState();
      expect(state.lanes).toBeInstanceOf(Map);
      expect(state.lanes.size).toBe(0);
    });
  });

  describe('setLanes', () => {
    it('should set lanes from array', () => {
      const lanes = [createLaneDto({ id: 'lane-1' }), createLaneDto({ id: 'lane-2' })];

      useLaneControlStore.getState().setLanes(lanes);

      const state = useLaneControlStore.getState();
      expect(state.lanes.size).toBe(2);
      expect(state.lanes.get('lane-1')?.id).toBe('lane-1');
      expect(state.lanes.get('lane-2')?.id).toBe('lane-2');
    });

    it('should replace existing lanes', () => {
      useLaneControlStore.getState().setLanes([createLaneDto({ id: 'lane-1' }), createLaneDto({ id: 'lane-2' })]);

      useLaneControlStore.getState().setLanes([createLaneDto({ id: 'lane-3' })]);

      const state = useLaneControlStore.getState();
      expect(state.lanes.size).toBe(1);
      expect(state.lanes.has('lane-3')).toBe(true);
      expect(state.lanes.has('lane-1')).toBe(false);
    });

    it('should not prune selection store when setting new lanes (decoupled)', () => {
      // Pre-select lane-1 and lane-2
      useSelectionStore.getState().toggleSelect('lane-1');
      useSelectionStore.getState().toggleSelect('lane-2');
      expect(useSelectionStore.getState().selectedIds.size).toBe(2);

      // Set lanes with only lane-1
      useLaneControlStore.getState().setLanes([createLaneDto({ id: 'lane-1' })]);

      // Selection should remain untouched — pruning is now handled by useLaneControlActions
      const selection = useSelectionStore.getState().selectedIds;
      expect(selection.size).toBe(2);
    });

    it('should handle empty array', () => {
      useLaneControlStore.getState().setLanes([createLaneDto({ id: 'lane-1' })]);
      useLaneControlStore.getState().setLanes([]);

      const state = useLaneControlStore.getState();
      expect(state.lanes.size).toBe(0);
    });
  });

  describe('updateLane', () => {
    it('should add new lane', () => {
      const lane = createLaneDto({ id: 'lane-new' });
      useLaneControlStore.getState().updateLane(lane);

      const state = useLaneControlStore.getState();
      expect(state.lanes.size).toBe(1);
      expect(state.lanes.get('lane-new')?.id).toBe('lane-new');
    });

    it('should replace existing lane fully', () => {
      useLaneControlStore.getState().setLanes([createLaneDto({ id: 'lane-1', totalScore: 100 })]);

      const updatedLane = createLaneDto({ id: 'lane-1', totalScore: 200 });
      useLaneControlStore.getState().updateLane(updatedLane);

      const state = useLaneControlStore.getState();
      expect(state.lanes.get('lane-1')?.totalScore).toBe(200);
    });

    it('should not affect other lanes', () => {
      useLaneControlStore.getState().setLanes([createLaneDto({ id: 'lane-1' }), createLaneDto({ id: 'lane-2' })]);

      useLaneControlStore.getState().updateLane(createLaneDto({ id: 'lane-1', totalScore: 999 }));

      const state = useLaneControlStore.getState();
      expect(state.lanes.size).toBe(2);
      expect(state.lanes.get('lane-2')?.totalScore).toBe(0);
    });
  });

  describe('patchLane', () => {
    it('should patch existing lane partially', () => {
      useLaneControlStore.getState().setLanes([createLaneDto({ id: 'lane-1', totalScore: 100, shotNumber: 5 })]);

      const result = useLaneControlStore.getState().patchLane('lane-1', { totalScore: 150 });

      expect(result.applied).toBe(true);
      expect(result.needsFullSync).toBe(false);
      const lane = useLaneControlStore.getState().lanes.get('lane-1');
      expect(lane?.totalScore).toBe(150);
      expect(lane?.shotNumber).toBe(5); // unchanged
    });

    it('should return failure for non-existent lane', () => {
      const result = useLaneControlStore.getState().patchLane('non-existent', { totalScore: 100 });

      expect(result.applied).toBe(false);
      expect(result.needsFullSync).toBe(true);
    });

    it('should patch multiple fields', () => {
      useLaneControlStore.getState().setLanes([createLaneDto({ id: 'lane-1' })]);

      useLaneControlStore.getState().patchLane('lane-1', {
        totalScore: 200,
        shotNumber: 10,
        phase: 'ACTIVE',
        playerName: 'Updated Player',
      });

      const lane = useLaneControlStore.getState().lanes.get('lane-1');
      expect(lane?.totalScore).toBe(200);
      expect(lane?.shotNumber).toBe(10);
      expect(lane?.phase).toBe('ACTIVE');
      expect(lane?.playerName).toBe('Updated Player');
    });
  });

  describe('updateLaneTimer', () => {
    it('should update timer fields', () => {
      useLaneControlStore.getState().setLanes([createLaneDto({ id: 'lane-1' })]);

      const result = useLaneControlStore.getState().updateLaneTimer('lane-1', 120, 'ACTIVE');

      expect(result.applied).toBe(true);
      const lane = useLaneControlStore.getState().lanes.get('lane-1');
      expect(lane?.remainingTime).toBe(120);
      expect(lane?.phase).toBe('ACTIVE');
    });

    it('should return failure for non-existent lane', () => {
      const result = useLaneControlStore.getState().updateLaneTimer('non-existent', 60, 'ACTIVE');

      expect(result.applied).toBe(false);
      expect(result.needsFullSync).toBe(true);
    });

    it('should not affect other lane fields', () => {
      useLaneControlStore.getState().setLanes([createLaneDto({ id: 'lane-1', totalScore: 100, playerName: 'Test' })]);

      useLaneControlStore.getState().updateLaneTimer('lane-1', 60, 'STAGE_ENTERED');

      const lane = useLaneControlStore.getState().lanes.get('lane-1');
      expect(lane?.totalScore).toBe(100);
      expect(lane?.playerName).toBe('Test');
    });
  });

  describe('clearLanes', () => {
    it('should clear all lanes', () => {
      useLaneControlStore.getState().setLanes([createLaneDto({ id: 'lane-1' }), createLaneDto({ id: 'lane-2' })]);

      useLaneControlStore.getState().clearLanes();

      const state = useLaneControlStore.getState();
      expect(state.lanes.size).toBe(0);
    });

    it('should not deselect all in selection store (decoupled)', () => {
      useSelectionStore.getState().toggleSelect('lane-1');
      expect(useSelectionStore.getState().selectedIds.size).toBe(1);

      useLaneControlStore.getState().clearLanes();

      // Selection should remain untouched — deselection is now handled by useLaneControlActions
      expect(useSelectionStore.getState().selectedIds.size).toBe(1);
    });
  });

  describe('reset', () => {
    it('should reset lanes to empty', () => {
      useLaneControlStore.getState().setLanes([createLaneDto({ id: 'lane-1' })]);

      useLaneControlStore.getState().reset();

      expect(useLaneControlStore.getState().lanes.size).toBe(0);
    });

    it('should not deselect all in selection store (decoupled)', () => {
      useSelectionStore.getState().toggleSelect('id-1');

      useLaneControlStore.getState().reset();

      // Selection should remain untouched — deselection is now handled by useLaneControlActions
      expect(useSelectionStore.getState().selectedIds.size).toBe(1);
    });
  });

  describe('getLaneById', () => {
    it('should return lane by id', () => {
      useLaneControlStore.getState().setLanes([createLaneDto({ id: 'lane-1' })]);

      const lane = useLaneControlStore.getState().getLaneById('lane-1');
      expect(lane?.id).toBe('lane-1');
    });

    it('should return undefined for non-existent id', () => {
      const lane = useLaneControlStore.getState().getLaneById('non-existent');
      expect(lane).toBeUndefined();
    });
  });

  describe('getLanesArray', () => {
    it('should return lanes as array', () => {
      useLaneControlStore.getState().setLanes([createLaneDto({ id: 'lane-1' }), createLaneDto({ id: 'lane-2' })]);

      const array = useLaneControlStore.getState().getLanesArray();
      expect(array).toHaveLength(2);
    });

    it('should return empty array when no lanes', () => {
      const array = useLaneControlStore.getState().getLanesArray();
      expect(array).toHaveLength(0);
    });
  });
});
