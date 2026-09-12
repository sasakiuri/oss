import { describe, it, expect } from 'vitest';
import { LaneControl } from '@/main/modules/lane-control/domain/LaneControl';
import { Channel } from '@/main/modules/lane-control/domain/Channel';
import { buildFinalConfig } from '../../../helpers/testConfigs';

function createFinalLane(participants = 8): LaneControl {
  return LaneControl.create('lane-1', Channel.create(1), buildFinalConfig(participants));
}

/** Advances a Final Lane through Stage 1 Series 1 to SERIES_COMPLETE. */
function createPhaseCompleteLane(): LaneControl {
  let lane = createFinalLane();
  lane = lane.startPreparation();
  lane = lane.advanceToNextStage().startMatch();
  for (let i = 0; i < 5; i++) {
    lane = lane.addShotByScore(10.0, Date.now(), i + 1);
  }
  expect(lane.phase).toBe('SERIES_COMPLETE');
  return lane;
}

// ---------------------------------------------------------------------------
// eliminate
// ---------------------------------------------------------------------------

describe('ShootoffOps', () => {
  describe('eliminate', () => {
    it('eliminates at rank 1', () => {
      const lane = createFinalLane();
      const result = lane.eliminate(1);
      expect(result.eliminated).toBe(true);
      expect(result.eliminationRank).toBe(1);
    });

    it('eliminates at rank 8', () => {
      const lane = createFinalLane();
      const result = lane.eliminate(8);
      expect(result.eliminated).toBe(true);
      expect(result.eliminationRank).toBe(8);
    });

    it('rejects rank 0', () => {
      const lane = createFinalLane();
      expect(() => lane.eliminate(0)).toThrow();
    });

    it('rejects a negative rank', () => {
      const lane = createFinalLane();
      expect(() => lane.eliminate(-1)).toThrow();
    });

    it('preserves immutability', () => {
      const lane = createFinalLane();
      const eliminated = lane.eliminate(3);
      expect(lane.eliminated).toBe(false);
      expect(eliminated.eliminated).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // startShootoff
  // ---------------------------------------------------------------------------

  describe('startShootoff', () => {
    it('transitions from SERIES_COMPLETE to SHOOTOFF', () => {
      const lane = createPhaseCompleteLane();
      const result = lane.startShootoff();
      expect(result.phase).toBe('SHOOTOFF');
      expect(result.timer).not.toBeNull();
      expect(result.shootoffShots).toEqual([]);
    });

    it('uses a 50-second SHOOTOFF timer', () => {
      const lane = createPhaseCompleteLane();
      const result = lane.startShootoff();
      expect(result.remainingTime).toBe(50);
    });

    it('rejects startShootoff from ACTIVE', () => {
      let lane = createFinalLane();
      lane = lane.startPreparation().advanceToNextStage().startMatch();
      expect(() => lane.startShootoff()).toThrow();
    });

    it('rejects startShootoff from IDLE', () => {
      const lane = createFinalLane();
      expect(() => lane.startShootoff()).toThrow();
    });

    it('preserves immutability', () => {
      const lane = createPhaseCompleteLane();
      const shootoff = lane.startShootoff();
      expect(lane.phase).toBe('SERIES_COMPLETE');
      expect(shootoff.phase).toBe('SHOOTOFF');
    });
  });

  // ---------------------------------------------------------------------------
  // addShootoffShot
  // ---------------------------------------------------------------------------

  describe('addShootoffShot', () => {
    it('adds a shot during SHOOTOFF', () => {
      const lane = createPhaseCompleteLane().startShootoff();
      const result = lane.addShootoffShot(10.5);
      expect(result.shootoffShots).toHaveLength(1);
      expect(result.shootoffShots[0]!.score.value).toBe(10.5);
    });

    it('adds multiple shots', () => {
      let lane = createPhaseCompleteLane().startShootoff();
      lane = lane.addShootoffShot(10.0);
      lane = lane.addShootoffShot(9.5);
      lane = lane.addShootoffShot(8.0);
      expect(lane.shootoffShots).toHaveLength(3);
    });

    it('assigns sequential shot numbers', () => {
      let lane = createPhaseCompleteLane().startShootoff();
      lane = lane.addShootoffShot(10.0);
      lane = lane.addShootoffShot(9.5);
      expect(lane.shootoffShots[0]!.shotNumber.value).toBe(1);
      expect(lane.shootoffShots[1]!.shotNumber.value).toBe(2);
    });

    it('rejects shots in SERIES_COMPLETE', () => {
      const lane = createPhaseCompleteLane();
      expect(() => lane.addShootoffShot(10.0)).toThrow();
    });

    it('rejects shots in ACTIVE', () => {
      let lane = createFinalLane();
      lane = lane.startPreparation().advanceToNextStage().startMatch();
      expect(() => lane.addShootoffShot(10.0)).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // resolveShootoff
  // ---------------------------------------------------------------------------

  describe('resolveShootoff', () => {
    it('transitions from SHOOTOFF back to SERIES_COMPLETE', () => {
      const lane = createPhaseCompleteLane().startShootoff();
      const result = lane.resolveShootoff();
      expect(result.phase).toBe('SERIES_COMPLETE');
      expect(result.timer).toBeNull();
    });

    it('retains shot data after resolveShootoff', () => {
      let lane = createPhaseCompleteLane().startShootoff();
      lane = lane.addShootoffShot(10.0);
      lane = lane.addShootoffShot(9.5);
      const resolved = lane.resolveShootoff();
      expect(resolved.shootoffShots).toHaveLength(2);
    });

    it('rejects resolveShootoff from SERIES_COMPLETE', () => {
      const lane = createPhaseCompleteLane();
      expect(() => lane.resolveShootoff()).toThrow();
    });

    it('rejects resolveShootoff from ACTIVE', () => {
      let lane = createFinalLane();
      lane = lane.startPreparation().advanceToNextStage().startMatch();
      expect(() => lane.resolveShootoff()).toThrow();
    });

    it('preserves immutability', () => {
      const lane = createPhaseCompleteLane().startShootoff();
      const resolved = lane.resolveShootoff();
      expect(lane.phase).toBe('SHOOTOFF');
      expect(resolved.phase).toBe('SERIES_COMPLETE');
    });
  });

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------

  describe('complete Shootoff flow', () => {
    it('moves from SERIES_COMPLETE through SHOOTOFF and resolution back to SERIES_COMPLETE', () => {
      let lane = createPhaseCompleteLane();
      lane = lane.startShootoff();
      expect(lane.phase).toBe('SHOOTOFF');
      lane = lane.addShootoffShot(10.5);
      lane = lane.addShootoffShot(9.0);
      lane = lane.resolveShootoff();
      expect(lane.phase).toBe('SERIES_COMPLETE');
      expect(lane.shootoffShots).toHaveLength(2);
    });
  });
});
