import { describe, it, expect, beforeEach } from 'vitest';
import {
  useShootoffStore,
  type ActiveShootoff,
  type ShootoffRoundData,
} from '@/renderer/presentation/stores/domain/shootoff.store';

/**
 * Helper function to create an ActiveShootoff for testing
 */
function createActiveShootoff(overrides: Partial<ActiveShootoff> = {}): ActiveShootoff {
  return {
    id: 'shootoff-1',
    targetLaneIds: ['lane-1', 'lane-2'],
    contestedRank: 8,
    rounds: [],
    isResolved: false,
    ...overrides,
  };
}

/**
 * Helper function to create a ShootoffRoundData for testing
 */
function createRoundData(overrides: Partial<ShootoffRoundData> = {}): ShootoffRoundData {
  return {
    roundNumber: 1,
    shots: [
      { participantId: 'p1', laneId: 'lane-1', score: 10.5 },
      { participantId: 'p2', laneId: 'lane-2', score: 10.3 },
    ],
    ...overrides,
  };
}

describe('useShootoffStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useShootoffStore.getState().clearAll();
  });

  describe('initial state', () => {
    it('should have activeShootoff as null', () => {
      const state = useShootoffStore.getState();
      expect(state.activeShootoff).toBeNull();
    });

    it('should have currentRoundScores as empty Map', () => {
      const state = useShootoffStore.getState();
      expect(state.currentRoundScores).toBeInstanceOf(Map);
      expect(state.currentRoundScores.size).toBe(0);
    });

    it('should have timerSeconds as 50', () => {
      const state = useShootoffStore.getState();
      expect(state.timerSeconds).toBe(50);
    });

    it('should have timerRunning as false', () => {
      const state = useShootoffStore.getState();
      expect(state.timerRunning).toBe(false);
    });
  });

  describe('setActiveShootoff', () => {
    it('should set shootoff', () => {
      const shootoff = createActiveShootoff({ id: 'shootoff-test' });

      useShootoffStore.getState().setActiveShootoff(shootoff);

      const state = useShootoffStore.getState();
      expect(state.activeShootoff).toEqual(shootoff);
      expect(state.activeShootoff?.id).toBe('shootoff-test');
    });

    it('should reset currentRoundScores when setting shootoff', () => {
      // First set some scores
      useShootoffStore.getState().setRoundScore('lane-1', 10.5);
      useShootoffStore.getState().setRoundScore('lane-2', 9.8);

      // Verify scores are set
      expect(useShootoffStore.getState().currentRoundScores.size).toBe(2);

      // Now set a new shootoff
      const shootoff = createActiveShootoff();
      useShootoffStore.getState().setActiveShootoff(shootoff);

      // Scores should be reset
      const state = useShootoffStore.getState();
      expect(state.currentRoundScores.size).toBe(0);
    });

    it('should reset timer when setting shootoff', () => {
      // Modify timer state
      useShootoffStore.getState().setTimer(30);
      useShootoffStore.getState().setTimerRunning(true);

      // Verify timer is modified
      expect(useShootoffStore.getState().timerSeconds).toBe(30);
      expect(useShootoffStore.getState().timerRunning).toBe(true);

      // Now set a new shootoff
      const shootoff = createActiveShootoff();
      useShootoffStore.getState().setActiveShootoff(shootoff);

      // Timer should be reset
      const state = useShootoffStore.getState();
      expect(state.timerSeconds).toBe(50);
      expect(state.timerRunning).toBe(false);
    });

    it('should clear shootoff when setting null', () => {
      // First set a shootoff
      const shootoff = createActiveShootoff();
      useShootoffStore.getState().setActiveShootoff(shootoff);

      // Verify it's set
      expect(useShootoffStore.getState().activeShootoff).not.toBeNull();

      // Now clear it
      useShootoffStore.getState().setActiveShootoff(null);

      const state = useShootoffStore.getState();
      expect(state.activeShootoff).toBeNull();
    });

    it('should preserve shootoff properties', () => {
      const shootoff = createActiveShootoff({
        id: 'shootoff-custom',
        targetLaneIds: ['lane-a', 'lane-b', 'lane-c'],
        contestedRank: 3,
        rounds: [createRoundData({ roundNumber: 1 })],
        isResolved: false,
        winnerLaneId: undefined,
      });

      useShootoffStore.getState().setActiveShootoff(shootoff);

      const state = useShootoffStore.getState();
      expect(state.activeShootoff?.id).toBe('shootoff-custom');
      expect(state.activeShootoff?.targetLaneIds).toEqual(['lane-a', 'lane-b', 'lane-c']);
      expect(state.activeShootoff?.contestedRank).toBe(3);
      expect(state.activeShootoff?.rounds.length).toBe(1);
      expect(state.activeShootoff?.isResolved).toBe(false);
    });
  });

  describe('setRoundScore', () => {
    it('should add score', () => {
      useShootoffStore.getState().setRoundScore('lane-1', 10.5);

      const state = useShootoffStore.getState();
      expect(state.currentRoundScores.get('lane-1')).toBe(10.5);
      expect(state.currentRoundScores.size).toBe(1);
    });

    it('should overwrite score for same laneId', () => {
      useShootoffStore.getState().setRoundScore('lane-1', 10.5);
      useShootoffStore.getState().setRoundScore('lane-1', 9.8);

      const state = useShootoffStore.getState();
      expect(state.currentRoundScores.get('lane-1')).toBe(9.8);
      expect(state.currentRoundScores.size).toBe(1);
    });

    it('should set scores for multiple laneIds', () => {
      useShootoffStore.getState().setRoundScore('lane-1', 10.5);
      useShootoffStore.getState().setRoundScore('lane-2', 9.8);
      useShootoffStore.getState().setRoundScore('lane-3', 10.0);

      const state = useShootoffStore.getState();
      expect(state.currentRoundScores.get('lane-1')).toBe(10.5);
      expect(state.currentRoundScores.get('lane-2')).toBe(9.8);
      expect(state.currentRoundScores.get('lane-3')).toBe(10.0);
      expect(state.currentRoundScores.size).toBe(3);
    });

    it('should handle zero score', () => {
      useShootoffStore.getState().setRoundScore('lane-1', 0);

      const state = useShootoffStore.getState();
      expect(state.currentRoundScores.get('lane-1')).toBe(0);
    });

    it('should handle negative score', () => {
      useShootoffStore.getState().setRoundScore('lane-1', -1);

      const state = useShootoffStore.getState();
      expect(state.currentRoundScores.get('lane-1')).toBe(-1);
    });
  });

  describe('clearCurrentRound', () => {
    it('should clear currentRoundScores', () => {
      useShootoffStore.getState().setRoundScore('lane-1', 10.5);
      useShootoffStore.getState().setRoundScore('lane-2', 9.8);

      useShootoffStore.getState().clearCurrentRound();

      const state = useShootoffStore.getState();
      expect(state.currentRoundScores.size).toBe(0);
    });

    it('should reset timerSeconds to 50', () => {
      useShootoffStore.getState().setTimer(30);

      useShootoffStore.getState().clearCurrentRound();

      const state = useShootoffStore.getState();
      expect(state.timerSeconds).toBe(50);
    });

    it('should set timerRunning to false', () => {
      useShootoffStore.getState().setTimerRunning(true);

      useShootoffStore.getState().clearCurrentRound();

      const state = useShootoffStore.getState();
      expect(state.timerRunning).toBe(false);
    });

    it('should not affect activeShootoff', () => {
      const shootoff = createActiveShootoff({ id: 'test-shootoff' });
      useShootoffStore.getState().setActiveShootoff(shootoff);
      useShootoffStore.getState().setRoundScore('lane-1', 10.5);

      useShootoffStore.getState().clearCurrentRound();

      const state = useShootoffStore.getState();
      expect(state.activeShootoff).not.toBeNull();
      expect(state.activeShootoff?.id).toBe('test-shootoff');
    });
  });

  describe('clearAll', () => {
    it('should reset all state', () => {
      // Set up some state
      const shootoff = createActiveShootoff({ id: 'test-shootoff' });
      useShootoffStore.getState().setActiveShootoff(shootoff);
      useShootoffStore.getState().setRoundScore('lane-1', 10.5);
      useShootoffStore.getState().setTimer(30);
      useShootoffStore.getState().setTimerRunning(true);

      // Clear all
      useShootoffStore.getState().clearAll();

      const state = useShootoffStore.getState();
      expect(state.activeShootoff).toBeNull();
      expect(state.currentRoundScores.size).toBe(0);
      expect(state.timerSeconds).toBe(50);
      expect(state.timerRunning).toBe(false);
    });

    it('should handle clearing already empty state', () => {
      useShootoffStore.getState().clearAll();

      const state = useShootoffStore.getState();
      expect(state.activeShootoff).toBeNull();
      expect(state.currentRoundScores.size).toBe(0);
      expect(state.timerSeconds).toBe(50);
      expect(state.timerRunning).toBe(false);
    });
  });

  describe('setTimer', () => {
    it('should set timer seconds', () => {
      useShootoffStore.getState().setTimer(30);

      const state = useShootoffStore.getState();
      expect(state.timerSeconds).toBe(30);
    });

    it('should allow zero', () => {
      useShootoffStore.getState().setTimer(0);

      const state = useShootoffStore.getState();
      expect(state.timerSeconds).toBe(0);
    });

    it('should not affect other state', () => {
      const shootoff = createActiveShootoff();
      useShootoffStore.getState().setActiveShootoff(shootoff);
      useShootoffStore.getState().setRoundScore('lane-1', 10.5);
      useShootoffStore.getState().setTimerRunning(true);

      useShootoffStore.getState().setTimer(25);

      const state = useShootoffStore.getState();
      expect(state.activeShootoff).not.toBeNull();
      expect(state.currentRoundScores.get('lane-1')).toBe(10.5);
      expect(state.timerRunning).toBe(true);
    });
  });

  describe('setTimerRunning', () => {
    it('should set timer running to true', () => {
      useShootoffStore.getState().setTimerRunning(true);

      const state = useShootoffStore.getState();
      expect(state.timerRunning).toBe(true);
    });

    it('should set timer running to false', () => {
      useShootoffStore.getState().setTimerRunning(true);
      useShootoffStore.getState().setTimerRunning(false);

      const state = useShootoffStore.getState();
      expect(state.timerRunning).toBe(false);
    });

    it('should not affect other state', () => {
      const shootoff = createActiveShootoff();
      useShootoffStore.getState().setActiveShootoff(shootoff);
      useShootoffStore.getState().setTimer(30);

      useShootoffStore.getState().setTimerRunning(true);

      const state = useShootoffStore.getState();
      expect(state.activeShootoff).not.toBeNull();
      expect(state.timerSeconds).toBe(30);
    });
  });

  describe('addRound', () => {
    it('should add round to activeShootoff', () => {
      const shootoff = createActiveShootoff({ rounds: [] });
      useShootoffStore.getState().setActiveShootoff(shootoff);

      const round = createRoundData({ roundNumber: 1 });
      useShootoffStore.getState().addRound(round);

      const state = useShootoffStore.getState();
      expect(state.activeShootoff?.rounds.length).toBe(1);
      expect(state.activeShootoff?.rounds[0]).toEqual(round);
    });

    it('should do nothing when activeShootoff is null', () => {
      // Ensure activeShootoff is null
      expect(useShootoffStore.getState().activeShootoff).toBeNull();

      const round = createRoundData({ roundNumber: 1 });
      useShootoffStore.getState().addRound(round);

      const state = useShootoffStore.getState();
      expect(state.activeShootoff).toBeNull();
    });

    it('should clear currentRoundScores after adding round', () => {
      const shootoff = createActiveShootoff();
      useShootoffStore.getState().setActiveShootoff(shootoff);
      useShootoffStore.getState().setRoundScore('lane-1', 10.5);
      useShootoffStore.getState().setRoundScore('lane-2', 9.8);

      // Verify scores are set
      expect(useShootoffStore.getState().currentRoundScores.size).toBe(2);

      const round = createRoundData({ roundNumber: 1 });
      useShootoffStore.getState().addRound(round);

      const state = useShootoffStore.getState();
      expect(state.currentRoundScores.size).toBe(0);
    });

    it('should reset timer after adding round', () => {
      const shootoff = createActiveShootoff();
      useShootoffStore.getState().setActiveShootoff(shootoff);
      useShootoffStore.getState().setTimer(10);
      useShootoffStore.getState().setTimerRunning(true);

      const round = createRoundData({ roundNumber: 1 });
      useShootoffStore.getState().addRound(round);

      const state = useShootoffStore.getState();
      expect(state.timerSeconds).toBe(50);
      expect(state.timerRunning).toBe(false);
    });

    it('should append rounds in order', () => {
      const shootoff = createActiveShootoff({ rounds: [] });
      useShootoffStore.getState().setActiveShootoff(shootoff);

      const round1 = createRoundData({ roundNumber: 1 });
      const round2 = createRoundData({ roundNumber: 2 });
      const round3 = createRoundData({ roundNumber: 3 });

      useShootoffStore.getState().addRound(round1);
      useShootoffStore.getState().addRound(round2);
      useShootoffStore.getState().addRound(round3);

      const state = useShootoffStore.getState();
      expect(state.activeShootoff?.rounds.length).toBe(3);
      expect(state.activeShootoff?.rounds[0]?.roundNumber).toBe(1);
      expect(state.activeShootoff?.rounds[1]?.roundNumber).toBe(2);
      expect(state.activeShootoff?.rounds[2]?.roundNumber).toBe(3);
    });

    it('should preserve existing rounds', () => {
      const existingRound = createRoundData({ roundNumber: 1 });
      const shootoff = createActiveShootoff({ rounds: [existingRound] });
      useShootoffStore.getState().setActiveShootoff(shootoff);

      const newRound = createRoundData({ roundNumber: 2 });
      useShootoffStore.getState().addRound(newRound);

      const state = useShootoffStore.getState();
      expect(state.activeShootoff?.rounds.length).toBe(2);
      expect(state.activeShootoff?.rounds[0]).toEqual(existingRound);
      expect(state.activeShootoff?.rounds[1]).toEqual(newRound);
    });
  });

  describe('resolveShootoff', () => {
    it('should set isResolved to true', () => {
      const shootoff = createActiveShootoff({ isResolved: false });
      useShootoffStore.getState().setActiveShootoff(shootoff);

      useShootoffStore.getState().resolveShootoff('lane-1');

      const state = useShootoffStore.getState();
      expect(state.activeShootoff?.isResolved).toBe(true);
    });

    it('should set winnerLaneId', () => {
      const shootoff = createActiveShootoff();
      useShootoffStore.getState().setActiveShootoff(shootoff);

      useShootoffStore.getState().resolveShootoff('lane-winner');

      const state = useShootoffStore.getState();
      expect(state.activeShootoff?.winnerLaneId).toBe('lane-winner');
    });

    it('should do nothing when activeShootoff is null', () => {
      // Ensure activeShootoff is null
      expect(useShootoffStore.getState().activeShootoff).toBeNull();

      useShootoffStore.getState().resolveShootoff('lane-1');

      const state = useShootoffStore.getState();
      expect(state.activeShootoff).toBeNull();
    });

    it('should preserve other shootoff properties', () => {
      const shootoff = createActiveShootoff({
        id: 'shootoff-preserve',
        targetLaneIds: ['lane-a', 'lane-b'],
        contestedRank: 5,
        rounds: [createRoundData()],
        isResolved: false,
      });
      useShootoffStore.getState().setActiveShootoff(shootoff);

      useShootoffStore.getState().resolveShootoff('lane-a');

      const state = useShootoffStore.getState();
      expect(state.activeShootoff?.id).toBe('shootoff-preserve');
      expect(state.activeShootoff?.targetLaneIds).toEqual(['lane-a', 'lane-b']);
      expect(state.activeShootoff?.contestedRank).toBe(5);
      expect(state.activeShootoff?.rounds.length).toBe(1);
      expect(state.activeShootoff?.isResolved).toBe(true);
      expect(state.activeShootoff?.winnerLaneId).toBe('lane-a');
    });

    it('should allow resolving an already resolved shootoff (overwrite winner)', () => {
      const shootoff = createActiveShootoff({ isResolved: true, winnerLaneId: 'lane-1' });
      useShootoffStore.getState().setActiveShootoff(shootoff);

      useShootoffStore.getState().resolveShootoff('lane-2');

      const state = useShootoffStore.getState();
      expect(state.activeShootoff?.isResolved).toBe(true);
      expect(state.activeShootoff?.winnerLaneId).toBe('lane-2');
    });
  });

  describe('edge cases', () => {
    it('should handle shootoff with many target lanes', () => {
      const shootoff = createActiveShootoff({
        targetLaneIds: ['lane-1', 'lane-2', 'lane-3', 'lane-4', 'lane-5'],
      });
      useShootoffStore.getState().setActiveShootoff(shootoff);

      const state = useShootoffStore.getState();
      expect(state.activeShootoff?.targetLaneIds.length).toBe(5);
    });

    it('should handle round with many shots', () => {
      const shootoff = createActiveShootoff();
      useShootoffStore.getState().setActiveShootoff(shootoff);

      const shots = Array.from({ length: 10 }, (_, i) => ({
        participantId: `p${i}`,
        laneId: `lane-${i}`,
        score: 10.0 - i * 0.1,
      }));
      const round = createRoundData({ shots });
      useShootoffStore.getState().addRound(round);

      const state = useShootoffStore.getState();
      expect(state.activeShootoff?.rounds[0]?.shots.length).toBe(10);
    });

    it('should handle decimal scores with precision', () => {
      useShootoffStore.getState().setRoundScore('lane-1', 10.567);

      const state = useShootoffStore.getState();
      expect(state.currentRoundScores.get('lane-1')).toBe(10.567);
    });

    it('should handle empty targetLaneIds', () => {
      const shootoff = createActiveShootoff({ targetLaneIds: [] });
      useShootoffStore.getState().setActiveShootoff(shootoff);

      const state = useShootoffStore.getState();
      expect(state.activeShootoff?.targetLaneIds).toEqual([]);
    });

    it('should handle contested rank of 1', () => {
      const shootoff = createActiveShootoff({ contestedRank: 1 });
      useShootoffStore.getState().setActiveShootoff(shootoff);

      const state = useShootoffStore.getState();
      expect(state.activeShootoff?.contestedRank).toBe(1);
    });
  });
});
