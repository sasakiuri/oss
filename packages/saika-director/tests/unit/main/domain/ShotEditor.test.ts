import { describe, it, expect } from 'vitest';
import { LaneControl } from '@/main/modules/lane-control/domain/LaneControl';
import { Channel } from '@/main/modules/lane-control/domain/Channel';
import { QUALIFICATION_CONFIG, buildFinalConfig } from '../../../helpers/testConfigs';

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

function createActiveLane(): LaneControl {
  let lane = LaneControl.create('lane-1', Channel.create(1), QUALIFICATION_CONFIG);
  lane = lane.startPreparation();
  lane = lane.addShotByScore(9.0, Date.now(), 1);
  lane = lane.addShotByScore(8.5, Date.now(), 2);
  lane = lane.advanceToNextStage().startMatch();
  lane = lane.addShotByScore(10.0, Date.now(), 3);
  lane = lane.addShotByScore(9.5, Date.now(), 4);
  lane = lane.addShotByScore(8.0, Date.now(), 5);
  return lane;
}

// ---------------------------------------------------------------------------
// updateShot
// ---------------------------------------------------------------------------

describe('ShotEditor', () => {
  describe('updateShot', () => {
    it('updates the score of a PREPARATION shot', () => {
      const lane = createActiveLane();
      const result = lane.updateShot(0, 10.0, 'PREPARATION');
      expect(result.preparationShots[0]!.score.value).toBe(10.0);
      expect(result.preparationShots[1]!.score.value).toBe(8.5);
    });

    it('updates the score of a MATCH shot', () => {
      const lane = createActiveLane();
      const result = lane.updateShot(1, 10.5, 'MATCH');
      expect(result.matchShots[1]!.score.value).toBe(10.5);
      expect(result.matchShots[0]!.score.value).toBe(10.0);
      expect(result.matchShots[2]!.score.value).toBe(8.0);
    });

    it('rejects an out-of-range PREPARATION index', () => {
      const lane = createActiveLane();
      expect(() => lane.updateShot(5, 10.0, 'PREPARATION')).toThrow();
    });

    it('rejects an out-of-range MATCH index', () => {
      const lane = createActiveLane();
      expect(() => lane.updateShot(10, 10.0, 'MATCH')).toThrow();
    });

    it('rejects a negative index', () => {
      const lane = createActiveLane();
      expect(() => lane.updateShot(-1, 10.0, 'MATCH')).toThrow();
    });

    it('rejects edits in IDLE', () => {
      const lane = LaneControl.create('lane-1', Channel.create(1), QUALIFICATION_CONFIG);
      expect(() => lane.updateShot(0, 10.0, 'MATCH')).toThrow();
    });

    it('allows edits in SERIES_COMPLETE', () => {
      let lane = LaneControl.create('lane-1', Channel.create(1), buildFinalConfig(8));
      lane = lane.startPreparation().advanceToNextStage().startMatch();
      for (let i = 0; i < 5; i++) {
        lane = lane.addShotByScore(10.0, Date.now(), i + 1);
      }
      expect(lane.phase).toBe('SERIES_COMPLETE');
      const result = lane.updateShot(0, 5.0, 'MATCH');
      expect(result.matchShots[0]!.score.value).toBe(5.0);
    });

    it('allows edits in FINISHED', () => {
      let lane = createActiveLane();
      lane = lane.finish();
      expect(lane.phase).toBe('FINISHED');
      const result = lane.updateShot(0, 5.0, 'MATCH');
      expect(result.matchShots[0]!.score.value).toBe(5.0);
    });

    it('allows edits in SHOT_COMPLETE', () => {
      let lane = LaneControl.create('lane-1', Channel.create(1), buildFinalConfig(8));
      lane = lane.startPreparation().advanceToNextStage().startMatch();
      for (let i = 0; i < 5; i++) {
        lane = lane.addShotByScore(10.0, Date.now(), i + 1);
      }
      lane = lane.startMatch();
      for (let i = 0; i < 5; i++) {
        lane = lane.addShotByScore(10.0, Date.now(), 6 + i);
      }
      lane = lane.advanceToNextStage().startMatch();
      lane = lane.addShotByScore(10.0, Date.now(), 11);
      expect(lane.phase).toBe('SHOT_COMPLETE');
      const result = lane.updateShot(0, 5.0, 'MATCH');
      expect(result.matchShots[0]!.score.value).toBe(5.0);
    });

    it('does not affect other shots when updating', () => {
      const lane = createActiveLane();
      const result = lane.updateShot(0, 7.0, 'MATCH');
      expect(result.matchShots).toHaveLength(3);
      expect(result.matchShots[0]!.score.value).toBe(7.0);
      expect(result.matchShots[1]!.score.value).toBe(9.5);
      expect(result.matchShots[2]!.score.value).toBe(8.0);
    });
  });

  // ---------------------------------------------------------------------------
  // removeShot
  // ---------------------------------------------------------------------------

  describe('removeShot', () => {
    it('removes a PREPARATION shot', () => {
      const lane = createActiveLane();
      const result = lane.removeShot(0, 'PREPARATION');
      expect(result.preparationShots).toHaveLength(1);
      expect(result.preparationShots[0]!.score.value).toBe(8.5);
    });

    it('removes a MATCH shot', () => {
      const lane = createActiveLane();
      const result = lane.removeShot(1, 'MATCH');
      expect(result.matchShots).toHaveLength(2);
      expect(result.matchShots[0]!.score.value).toBe(10.0);
      expect(result.matchShots[1]!.score.value).toBe(8.0);
    });

    it('renumbers shots after removal', () => {
      const lane = createActiveLane();
      const result = lane.removeShot(0, 'MATCH');
      expect(result.matchShots[0]!.shotNumber.value).toBe(1);
      expect(result.matchShots[1]!.shotNumber.value).toBe(2);
    });

    it('rejects an out-of-range index', () => {
      const lane = createActiveLane();
      expect(() => lane.removeShot(10, 'MATCH')).toThrow();
    });

    it('rejects a negative index', () => {
      const lane = createActiveLane();
      expect(() => lane.removeShot(-1, 'PREPARATION')).toThrow();
    });

    it('rejects removal in IDLE', () => {
      const lane = LaneControl.create('lane-1', Channel.create(1), QUALIFICATION_CONFIG);
      expect(() => lane.removeShot(0, 'MATCH')).toThrow();
    });

    it('removes the final shot', () => {
      const lane = createActiveLane();
      const result = lane.removeShot(2, 'MATCH');
      expect(result.matchShots).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // insertShot
  // ---------------------------------------------------------------------------

  describe('insertShot', () => {
    it('inserts a MATCH shot at the beginning', () => {
      const lane = createActiveLane();
      const result = lane.insertShot(0, 7.0, 'MATCH');
      expect(result.matchShots).toHaveLength(4);
      expect(result.matchShots[0]!.score.value).toBe(7.0);
      expect(result.matchShots[1]!.score.value).toBe(10.0);
    });

    it('inserts a MATCH shot at the end', () => {
      const lane = createActiveLane();
      const result = lane.insertShot(3, 7.0, 'MATCH');
      expect(result.matchShots).toHaveLength(4);
      expect(result.matchShots[3]!.score.value).toBe(7.0);
    });

    it('inserts a MATCH shot in the middle', () => {
      const lane = createActiveLane();
      const result = lane.insertShot(1, 6.0, 'MATCH');
      expect(result.matchShots).toHaveLength(4);
      expect(result.matchShots[0]!.score.value).toBe(10.0);
      expect(result.matchShots[1]!.score.value).toBe(6.0);
      expect(result.matchShots[2]!.score.value).toBe(9.5);
      expect(result.matchShots[3]!.score.value).toBe(8.0);
    });

    it('inserts a PREPARATION shot', () => {
      const lane = createActiveLane();
      const result = lane.insertShot(1, 7.5, 'PREPARATION');
      expect(result.preparationShots).toHaveLength(3);
      expect(result.preparationShots[1]!.score.value).toBe(7.5);
    });

    it('renumbers shots after insertion', () => {
      const lane = createActiveLane();
      const result = lane.insertShot(1, 6.0, 'MATCH');
      expect(result.matchShots[0]!.shotNumber.value).toBe(1);
      expect(result.matchShots[1]!.shotNumber.value).toBe(2);
      expect(result.matchShots[2]!.shotNumber.value).toBe(3);
      expect(result.matchShots[3]!.shotNumber.value).toBe(4);
    });

    it('rejects an index beyond the array length', () => {
      const lane = createActiveLane();
      expect(() => lane.insertShot(10, 10.0, 'MATCH')).toThrow();
    });

    it('rejects a negative index', () => {
      const lane = createActiveLane();
      expect(() => lane.insertShot(-1, 10.0, 'MATCH')).toThrow();
    });

    it('rejects insertion in IDLE', () => {
      const lane = LaneControl.create('lane-1', Channel.create(1), QUALIFICATION_CONFIG);
      expect(() => lane.insertShot(0, 10.0, 'MATCH')).toThrow();
    });

    it('inserts into an empty array at index 0', () => {
      let lane = LaneControl.create('lane-1', Channel.create(1), QUALIFICATION_CONFIG);
      lane = lane.startPreparation().advanceToNextStage().startMatch();
      const result = lane.insertShot(0, 10.0, 'MATCH');
      expect(result.matchShots).toHaveLength(1);
      expect(result.matchShots[0]!.score.value).toBe(10.0);
    });
  });

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------

  describe('direct pure function calls', () => {
    it('returns a MutablePatch from updateShot', () => {
      const lane = createActiveLane();
      const updated = lane.updateShot(0, 5.0, 'MATCH');
      expect(updated.matchShots[0]!.score.value).toBe(5.0);
      expect(lane.matchShots[0]!.score.value).toBe(10.0);
    });

    it('preserves immutability in removeShot', () => {
      const lane = createActiveLane();
      const removed = lane.removeShot(0, 'MATCH');
      expect(removed.matchShots).toHaveLength(2);
      expect(lane.matchShots).toHaveLength(3);
    });

    it('preserves immutability in insertShot', () => {
      const lane = createActiveLane();
      const inserted = lane.insertShot(0, 5.0, 'MATCH');
      expect(inserted.matchShots).toHaveLength(4);
      expect(lane.matchShots).toHaveLength(3);
    });
  });
});
