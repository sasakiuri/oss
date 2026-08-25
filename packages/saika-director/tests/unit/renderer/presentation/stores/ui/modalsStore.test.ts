import { describe, it, expect, beforeEach } from 'vitest';
import { useShotEditStore, useLaneMoveStore } from '@/renderer/presentation/stores/ui/modals.store';
import type { ShotDto } from '@/shared/ipc/contracts/laneControl.contract';

function createShotDto(overrides: Partial<ShotDto> = {}): ShotDto {
  return {
    shotNumber: 1,
    score: 10.5,
    seriesNumber: 1,
    ...overrides,
  };
}

describe('useShotEditStore', () => {
  beforeEach(() => {
    useShotEditStore.getState().closeModal();
  });

  describe('initial state', () => {
    it('should have isOpen as false', () => {
      expect(useShotEditStore.getState().isOpen).toBe(false);
    });

    it('should have null laneId', () => {
      expect(useShotEditStore.getState().laneId).toBeNull();
    });

    it('should have null laneName', () => {
      expect(useShotEditStore.getState().laneName).toBeNull();
    });

    it('should have null channel', () => {
      expect(useShotEditStore.getState().channel).toBeNull();
    });

    it('should have MATCH as default activePhase', () => {
      expect(useShotEditStore.getState().activePhase).toBe('MATCH');
    });

    it('should have empty shots arrays', () => {
      expect(useShotEditStore.getState().preparationShots).toEqual([]);
      expect(useShotEditStore.getState().matchShots).toEqual([]);
    });

    it('should have zero totalScore', () => {
      expect(useShotEditStore.getState().totalScore).toBe(0);
    });

    it('should have loading as false', () => {
      expect(useShotEditStore.getState().loading).toBe(false);
    });

    it('should have null error', () => {
      expect(useShotEditStore.getState().error).toBeNull();
    });
  });

  describe('openModal', () => {
    it('should open modal with lane info', () => {
      useShotEditStore.getState().openModal('lane-1', 'Lane 1', 1);

      const state = useShotEditStore.getState();
      expect(state.isOpen).toBe(true);
      expect(state.laneId).toBe('lane-1');
      expect(state.laneName).toBe('Lane 1');
      expect(state.channel).toBe(1);
    });

    it('should reset all fields on open', () => {
      // Pre-set some state
      useShotEditStore.getState().openModal('old', 'Old', 0);
      useShotEditStore.getState().setShots([createShotDto()], [createShotDto()], 100, [50, 50]);
      useShotEditStore.getState().setLoading(true);
      useShotEditStore.getState().setError('some error');

      // Open new modal
      useShotEditStore.getState().openModal('lane-2', 'Lane 2', 2);

      const state = useShotEditStore.getState();
      expect(state.activePhase).toBe('MATCH');
      expect(state.preparationShots).toEqual([]);
      expect(state.matchShots).toEqual([]);
      expect(state.totalScore).toBe(0);
      expect(state.seriesScores).toEqual([]);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('closeModal', () => {
    it('should reset all state', () => {
      useShotEditStore.getState().openModal('lane-1', 'Lane 1', 1);
      useShotEditStore.getState().setShots([createShotDto()], [createShotDto()], 100, [50, 50]);

      useShotEditStore.getState().closeModal();

      const state = useShotEditStore.getState();
      expect(state.isOpen).toBe(false);
      expect(state.laneId).toBeNull();
      expect(state.laneName).toBeNull();
      expect(state.channel).toBeNull();
      expect(state.preparationShots).toEqual([]);
      expect(state.matchShots).toEqual([]);
      expect(state.totalScore).toBe(0);
    });
  });

  describe('setActivePhase', () => {
    it('should set active phase to PREPARATION', () => {
      useShotEditStore.getState().setActivePhase('PREPARATION');
      expect(useShotEditStore.getState().activePhase).toBe('PREPARATION');
    });

    it('should set active phase to MATCH', () => {
      useShotEditStore.getState().setActivePhase('PREPARATION');
      useShotEditStore.getState().setActivePhase('MATCH');
      expect(useShotEditStore.getState().activePhase).toBe('MATCH');
    });
  });

  describe('setShots', () => {
    it('should set shots data', () => {
      const prepShots = [createShotDto({ shotNumber: 1 })];
      const matchShots = [createShotDto({ shotNumber: 2 }), createShotDto({ shotNumber: 3 })];

      useShotEditStore.getState().setShots(prepShots, matchShots, 150, [50, 100]);

      const state = useShotEditStore.getState();
      expect(state.preparationShots).toHaveLength(1);
      expect(state.matchShots).toHaveLength(2);
      expect(state.totalScore).toBe(150);
      expect(state.seriesScores).toEqual([50, 100]);
    });
  });

  describe('setLoading', () => {
    it('should set loading to true', () => {
      useShotEditStore.getState().setLoading(true);
      expect(useShotEditStore.getState().loading).toBe(true);
    });

    it('should set loading to false', () => {
      useShotEditStore.getState().setLoading(true);
      useShotEditStore.getState().setLoading(false);
      expect(useShotEditStore.getState().loading).toBe(false);
    });
  });

  describe('setError', () => {
    it('should set error message', () => {
      useShotEditStore.getState().setError('Network error');
      expect(useShotEditStore.getState().error).toBe('Network error');
    });

    it('should clear error with null', () => {
      useShotEditStore.getState().setError('error');
      useShotEditStore.getState().setError(null);
      expect(useShotEditStore.getState().error).toBeNull();
    });
  });
});

describe('useLaneMoveStore', () => {
  beforeEach(() => {
    useLaneMoveStore.getState().closeModal();
  });

  describe('initial state', () => {
    it('should have isOpen as false', () => {
      expect(useLaneMoveStore.getState().isOpen).toBe(false);
    });

    it('should have null sourceLaneId', () => {
      expect(useLaneMoveStore.getState().sourceLaneId).toBeNull();
    });

    it('should have null sourceLaneName', () => {
      expect(useLaneMoveStore.getState().sourceLaneName).toBeNull();
    });

    it('should have null sourceChannel', () => {
      expect(useLaneMoveStore.getState().sourceChannel).toBeNull();
    });

    it('should have null selectedTargetLaneId', () => {
      expect(useLaneMoveStore.getState().selectedTargetLaneId).toBeNull();
    });

    it('should have loading as false', () => {
      expect(useLaneMoveStore.getState().loading).toBe(false);
    });

    it('should have null error', () => {
      expect(useLaneMoveStore.getState().error).toBeNull();
    });
  });

  describe('openModal', () => {
    it('should open modal with source lane info', () => {
      useLaneMoveStore.getState().openModal('lane-1', 'Lane 1', 1);

      const state = useLaneMoveStore.getState();
      expect(state.isOpen).toBe(true);
      expect(state.sourceLaneId).toBe('lane-1');
      expect(state.sourceLaneName).toBe('Lane 1');
      expect(state.sourceChannel).toBe(1);
    });

    it('should reset transient state on open', () => {
      useLaneMoveStore.getState().openModal('old', 'Old', 0);
      useLaneMoveStore.getState().setSelectedTargetLaneId('target-1');
      useLaneMoveStore.getState().setLoading(true);
      useLaneMoveStore.getState().setError('error');

      useLaneMoveStore.getState().openModal('lane-2', 'Lane 2', 2);

      const state = useLaneMoveStore.getState();
      expect(state.selectedTargetLaneId).toBeNull();
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('closeModal', () => {
    it('should reset all state', () => {
      useLaneMoveStore.getState().openModal('lane-1', 'Lane 1', 1);
      useLaneMoveStore.getState().setSelectedTargetLaneId('target');

      useLaneMoveStore.getState().closeModal();

      const state = useLaneMoveStore.getState();
      expect(state.isOpen).toBe(false);
      expect(state.sourceLaneId).toBeNull();
      expect(state.selectedTargetLaneId).toBeNull();
    });
  });

  describe('setSelectedTargetLaneId', () => {
    it('should set target lane id', () => {
      useLaneMoveStore.getState().setSelectedTargetLaneId('target-1');
      expect(useLaneMoveStore.getState().selectedTargetLaneId).toBe('target-1');
    });

    it('should allow setting null', () => {
      useLaneMoveStore.getState().setSelectedTargetLaneId('target-1');
      useLaneMoveStore.getState().setSelectedTargetLaneId(null);
      expect(useLaneMoveStore.getState().selectedTargetLaneId).toBeNull();
    });
  });

  describe('setLoading', () => {
    it('should set loading state', () => {
      useLaneMoveStore.getState().setLoading(true);
      expect(useLaneMoveStore.getState().loading).toBe(true);
    });
  });

  describe('setError', () => {
    it('should set error message', () => {
      useLaneMoveStore.getState().setError('Move failed');
      expect(useLaneMoveStore.getState().error).toBe('Move failed');
    });

    it('should clear error with null', () => {
      useLaneMoveStore.getState().setError('error');
      useLaneMoveStore.getState().setError(null);
      expect(useLaneMoveStore.getState().error).toBeNull();
    });
  });
});
