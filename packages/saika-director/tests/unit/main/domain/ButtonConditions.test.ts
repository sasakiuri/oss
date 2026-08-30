import { describe, it, expect } from 'vitest';
import { LaneControl } from '@/main/modules/lane-control/domain/LaneControl';
import { Channel } from '@/main/modules/lane-control/domain/Channel';
import { QUALIFICATION_CONFIG, buildFinalConfig, buildMultiShotSeriesFinalConfig } from '../../../helpers/testConfigs';

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

function createQualificationLane(): LaneControl {
  return LaneControl.create('lane-1', Channel.create(1), QUALIFICATION_CONFIG);
}

function createFinalLane(participants = 8): LaneControl {
  return LaneControl.create('lane-1', Channel.create(1), buildFinalConfig(participants));
}

function createMultiShotSeriesFinalLane(participants = 8): LaneControl {
  return LaneControl.create('lane-1', Channel.create(1), buildMultiShotSeriesFinalConfig(participants));
}

// ---------------------------------------------------------------------------
// canStartPreparation
// ---------------------------------------------------------------------------

describe('ButtonConditions', () => {
  describe('canStartPreparation', () => {
    it('returns true in IDLE', () => {
      const lane = createQualificationLane();
      expect(lane.canStartPreparation).toBe(true);
    });

    it('returns false in ACTIVE', () => {
      const lane = createQualificationLane().startPreparation();
      expect(lane.canStartPreparation).toBe(false);
    });

    it('returns false in STAGE_ENTERED', () => {
      const lane = createQualificationLane().startPreparation().advanceToNextStage();
      expect(lane.canStartPreparation).toBe(false);
    });

    it('returns false in FINISHED', () => {
      const lane = createQualificationLane().startPreparation().finish();
      expect(lane.canStartPreparation).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // canAdvanceToNextStage
  // ---------------------------------------------------------------------------

  describe('canAdvanceToNextStage', () => {
    it('returns false in IDLE', () => {
      const lane = createQualificationLane();
      expect(lane.canAdvanceToNextStage).toBe(false);
    });

    it('returns true in ACTIVE Preparation when another stage exists', () => {
      const lane = createQualificationLane().startPreparation();
      expect(lane.canAdvanceToNextStage).toBe(true);
    });

    it('returns true in Final SERIES_COMPLETE when 2nd Stage exists', () => {
      let lane = createFinalLane();
      lane = lane.startPreparation().advanceToNextStage().startMatch();
      for (let i = 0; i < 5; i++) {
        lane = lane.addShotByScore(10.0, Date.now(), i + 1);
      }
      // Series 2
      lane = lane.startMatch();
      for (let i = 0; i < 5; i++) {
        lane = lane.addShotByScore(10.0, Date.now(), 6 + i);
      }
      expect(lane.phase).toBe('SERIES_COMPLETE');
      expect(lane.canAdvanceToNextStage).toBe(true);
    });

    it('returns true in Final SERIES_COMPLETE when another stage exists despite another series', () => {
      let lane = createFinalLane();
      lane = lane.startPreparation().advanceToNextStage().startMatch();
      for (let i = 0; i < 5; i++) {
        lane = lane.addShotByScore(10.0, Date.now(), i + 1);
      }
      expect(lane.phase).toBe('SERIES_COMPLETE');
      expect(lane.canAdvanceToNextStage).toBe(true);
    });

    it('returns false in FINISHED', () => {
      const lane = createQualificationLane().startPreparation().finish();
      expect(lane.canAdvanceToNextStage).toBe(false);
    });

    it('returns false in STAGE_ENTERED', () => {
      const lane = createQualificationLane().startPreparation().advanceToNextStage();
      expect(lane.canAdvanceToNextStage).toBe(false);
    });

    it('returns false in SHOT_COMPLETE when no next stage exists', () => {
      let lane = createMultiShotSeriesFinalLane();
      lane = lane.startPreparation().advanceToNextStage().startMatch();
      for (let i = 0; i < 5; i++) {
        lane = lane.addShotByScore(10.0, Date.now(), i + 1);
      }
      lane = lane.startMatch();
      for (let i = 0; i < 5; i++) {
        lane = lane.addShotByScore(10.0, Date.now(), 6 + i);
      }
      // 2nd Stage
      lane = lane.advanceToNextStage().startMatch();
      lane = lane.addShotByScore(10.0, Date.now(), 11);
      expect(lane.phase).toBe('SHOT_COMPLETE');
      expect(lane.canAdvanceToNextStage).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // canStartMatch
  // ---------------------------------------------------------------------------

  describe('canStartMatch', () => {
    it('returns false in IDLE', () => {
      const lane = createQualificationLane();
      expect(lane.canStartMatch).toBe(false);
    });

    it('returns true in STAGE_ENTERED', () => {
      const lane = createQualificationLane().startPreparation().advanceToNextStage();
      expect(lane.canStartMatch).toBe(true);
    });

    it('returns true in Final SERIES_COMPLETE when the stage has another series', () => {
      let lane = createFinalLane();
      lane = lane.startPreparation().advanceToNextStage().startMatch();
      for (let i = 0; i < 5; i++) {
        lane = lane.addShotByScore(10.0, Date.now(), i + 1);
      }
      expect(lane.phase).toBe('SERIES_COMPLETE');
      expect(lane.canStartMatch).toBe(true);
    });

    it('returns false in FINISHED', () => {
      const lane = createQualificationLane().startPreparation().finish();
      expect(lane.canStartMatch).toBe(false);
    });

    it('returns true in Final ACTIVE when the stage has another series', () => {
      let lane = createFinalLane();
      lane = lane.startPreparation().advanceToNextStage().startMatch();
      expect(lane.phase).toBe('ACTIVE');
      expect(lane.canStartMatch).toBe(true);
    });

    it('returns false in Qualification ACTIVE when the stage has no next series', () => {
      let lane = createQualificationLane();
      lane = lane.startPreparation().advanceToNextStage().startMatch();
      expect(lane.phase).toBe('ACTIVE');
      expect(lane.canStartMatch).toBe(true);
    });

    it('returns true in SHOT_COMPLETE', () => {
      let lane = createMultiShotSeriesFinalLane();
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
      expect(lane.canStartMatch).toBe(true);
    });

    it('returns false in Final SERIES_COMPLETE when the stage has no next series', () => {
      let lane = createFinalLane();
      lane = lane.startPreparation().advanceToNextStage().startMatch();
      for (let i = 0; i < 5; i++) {
        lane = lane.addShotByScore(10.0, Date.now(), i + 1);
      }
      lane = lane.startMatch();
      for (let i = 0; i < 5; i++) {
        lane = lane.addShotByScore(10.0, Date.now(), 6 + i);
      }
      expect(lane.phase).toBe('SERIES_COMPLETE');
      expect(lane.canStartMatch).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // canFinish
  // ---------------------------------------------------------------------------

  describe('canFinish', () => {
    it('returns false in IDLE', () => {
      const lane = createQualificationLane();
      expect(lane.canFinish).toBe(false);
    });

    it('returns true in ACTIVE', () => {
      const lane = createQualificationLane().startPreparation();
      expect(lane.canFinish).toBe(true);
    });

    it('returns true in SERIES_COMPLETE', () => {
      let lane = createFinalLane();
      lane = lane.startPreparation().advanceToNextStage().startMatch();
      for (let i = 0; i < 5; i++) {
        lane = lane.addShotByScore(10.0, Date.now(), i + 1);
      }
      expect(lane.phase).toBe('SERIES_COMPLETE');
      expect(lane.canFinish).toBe(true);
    });

    it('returns false in FINISHED', () => {
      const lane = createQualificationLane().startPreparation().finish();
      expect(lane.canFinish).toBe(false);
    });

    it('returns false in STAGE_ENTERED', () => {
      const lane = createQualificationLane().startPreparation().advanceToNextStage();
      expect(lane.canFinish).toBe(false);
    });

    it('returns true in SHOT_COMPLETE', () => {
      let lane = createMultiShotSeriesFinalLane();
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
      expect(lane.canFinish).toBe(true);
    });
  });
});
