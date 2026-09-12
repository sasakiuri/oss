import { describe, it, expect } from 'vitest';
import { LaneControl } from '@/main/modules/lane-control/domain/LaneControl';
import { Channel } from '@/main/modules/lane-control/domain/Channel';
import { Player } from '@/main/modules/lane-control/domain/Player';
import { QUALIFICATION_CONFIG, buildFinalConfig, buildMultiShotSeriesFinalConfig } from '../../../helpers/testConfigs';
import { ISSF_2026_R3P_FINAL } from '@sasakiuri/saika-rules';
import { competitionTypeFromRulePack } from '@/shared/competitionTypes';
import { buildRoundConfig } from '@/shared/constants/roundConfig';

function createQualificationLane(channel = 1): LaneControl {
  return LaneControl.create(`lane-${channel}`, Channel.create(channel), QUALIFICATION_CONFIG);
}

function createFinalLane(channel = 1, participants = 8): LaneControl {
  return LaneControl.create(`lane-${channel}`, Channel.create(channel), buildFinalConfig(participants));
}

function createMultiShotSeriesFinalLane(channel = 1, participants = 8): LaneControl {
  return LaneControl.create(`lane-${channel}`, Channel.create(channel), buildMultiShotSeriesFinalConfig(participants));
}

function create50mFinalLane(channel = 1): LaneControl {
  return LaneControl.create(
    `lane-${channel}`,
    Channel.create(channel),
    buildRoundConfig(competitionTypeFromRulePack(ISSF_2026_R3P_FINAL), 8),
  );
}

/**
 * Adds N scored shots to an ACTIVE Lane.
 * The absolute shot number is derived from the existing match shot count.
 */
function addShots(lane: LaneControl, count: number, score = 10.0): LaneControl {
  let current = lane;
  for (let i = 0; i < count; i++) {
    const absNum = current.matchShots.length + current.preparationShots.length + 1;
    current = current.addShotByScore(score, Date.now(), absNum);
  }
  return current;
}

/**
 * Adds N scored shots.
 * Starts the next commanded shot or series whenever the Lane pauses.
 */
function addShotsWithMatchResume(lane: LaneControl, count: number, score = 10.0): LaneControl {
  let current = lane;
  for (let i = 0; i < count; i++) {
    if (current.phase === 'SHOT_COMPLETE' || current.phase === 'SERIES_COMPLETE') {
      current = current.startMatch();
    }
    const absNum = current.matchShots.length + current.preparationShots.length + 1;
    current = current.addShotByScore(score, Date.now(), absNum);
  }
  return current;
}

/** Fully consumes the timer. */
function exhaustTimer(lane: LaneControl): LaneControl {
  let current = lane;
  while (current.remainingTime > 0) {
    current = current.tickTimer();
  }
  return current.tickTimer();
}

describe('LaneControl characterization tests', () => {
  describe('Qualification: normal flow', () => {
    it('starts in IDLE', () => {
      const lane = createQualificationLane();
      expect(lane.phase).toBe('IDLE');
      expect(lane.stageIndex).toBe(0);
      expect(lane.seriesIndex).toBe(0);
      expect(lane.timer).toBeNull();
      expect(lane.matchShots).toEqual([]);
      expect(lane.preparationShots).toEqual([]);
      expect(lane.shootoffShots).toEqual([]);
      expect(lane.totalScore).toBe(0);
    });

    it('IDLE → ACTIVE (Preparation): startPreparation', () => {
      const lane = createQualificationLane().startPreparation();
      expect(lane.phase).toBe('ACTIVE');
      expect(lane.stageIndex).toBe(0);
      expect(lane.seriesIndex).toBe(0);
      expect(lane.timer).not.toBeNull();
      expect(lane.remainingTime).toBe(600);
      expect(lane.currentStage.type).toBe('preparation');
    });

    it('allows sighting shots during Preparation', () => {
      const lane = createQualificationLane().startPreparation();
      const after = lane.addShotByScore(9.5, Date.now(), 1);
      expect(after.preparationShots).toHaveLength(1);
      expect(after.preparationShots[0]!.score.value).toBe(9.5);
      expect(after.matchShots).toHaveLength(0);
      expect(after.phase).toBe('ACTIVE');
    });

    it('remains ACTIVE when the Preparation timer expires', () => {
      const lane = createQualificationLane().startPreparation();
      const expired = exhaustTimer(lane);
      expect(expired.phase).toBe('ACTIVE');
      expect(expired.remainingTime).toBe(0);
    });

    it('ACTIVE(Preparation) → STAGE_ENTERED → ACTIVE(Match): advanceToNextStage + startMatch', () => {
      let lane = createQualificationLane().startPreparation();
      lane = lane.advanceToNextStage();
      expect(lane.phase).toBe('STAGE_ENTERED');
      expect(lane.stageIndex).toBe(1);

      lane = lane.startMatch();
      expect(lane.phase).toBe('ACTIVE');
      expect(lane.stageIndex).toBe(1);
      expect(lane.currentStage.type).toBe('match');
      expect(lane.remainingTime).toBe(2700);
    });

    it('transitions automatically to FINISHED after 60 shots', () => {
      let lane = createQualificationLane().startPreparation();
      lane = lane.advanceToNextStage().startMatch();
      lane = addShots(lane, 60, 10.0);
      expect(lane.phase).toBe('FINISHED');
      expect(lane.matchShots).toHaveLength(60);
      expect(lane.totalScore).toBe(600);
    });

    it('transitions to FINISHED when the Match timer expires', () => {
      let lane = createQualificationLane().startPreparation();
      lane = lane.advanceToNextStage().startMatch();
      lane = addShots(lane, 30, 9.0);
      lane = exhaustTimer(lane);
      expect(lane.phase).toBe('FINISHED');
      expect(lane.matchShots).toHaveLength(60);
      expect(lane.matchShots.filter((shot) => shot.disposition === 'MISS')).toHaveLength(30);
      expect(lane.totalScore).toBe(270);
    });

    it('transitions to FINISHED when finished manually', () => {
      let lane = createQualificationLane().startPreparation();
      lane = lane.advanceToNextStage().startMatch();
      lane = addShots(lane, 10, 10.0);
      lane = lane.finish();
      expect(lane.phase).toBe('FINISHED');
    });
  });

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------

  describe('Final: normal flow', () => {
    it('uses a Final config with Preparation and sighting, 1st Stage, and 2nd Stage', () => {
      const lane = createFinalLane();
      const config = lane.config;
      expect(config.roundType).toBe('Final');
      // stages: Preparation(0) + 1st Stage(1) + 2nd Stage(2) = 3
      expect(config.stages).toHaveLength(3);
      expect(config.stages[0]!.type).toBe('preparation');
      expect(config.stages[0]!.name).toBe('Preparation and sighting');
      expect(config.stages[1]!.name).toBe('1st Stage');
      expect(config.stages[1]!.series).toHaveLength(2); // 2 series of 5 shots
      expect(config.stages[2]!.name).toBe('2nd Stage');
      expect(config.stages[2]!.series).toHaveLength(14); // 14 single-shot series
      expect(config.stages[2]!.series.every((series) => series.shots === 1)).toBe(true);
    });

    it('transitions from IDLE through Preparation and 1st Stage to SERIES_COMPLETE', () => {
      let lane = createFinalLane();
      // Preparation
      lane = lane.startPreparation();
      expect(lane.phase).toBe('ACTIVE');
      expect(lane.currentStage.type).toBe('preparation');

      // → 1st Stage
      lane = lane.advanceToNextStage();
      expect(lane.phase).toBe('STAGE_ENTERED');
      expect(lane.stageIndex).toBe(1);

      lane = lane.startMatch();
      expect(lane.phase).toBe('ACTIVE');
      expect(lane.currentStageName).toBe('1st Stage');

      lane = addShots(lane, 5, 10.5);
      expect(lane.phase).toBe('SERIES_COMPLETE');
      expect(lane.matchShots).toHaveLength(5);
    });

    it('transitions from 1st Stage Series 2 through SERIES_COMPLETE to 2nd Stage', () => {
      let lane = createFinalLane();
      lane = lane.startPreparation().advanceToNextStage().startMatch();
      lane = addShots(lane, 5, 10.0);
      expect(lane.phase).toBe('SERIES_COMPLETE');

      lane = lane.startMatch();
      expect(lane.phase).toBe('ACTIVE');
      expect(lane.stageIndex).toBe(1);
      expect(lane.seriesIndex).toBe(1);

      lane = addShots(lane, 5, 10.0);
      expect(lane.phase).toBe('SERIES_COMPLETE');
      expect(lane.matchShots).toHaveLength(10);

      // → 2nd Stage
      lane = lane.advanceToNextStage();
      expect(lane.phase).toBe('STAGE_ENTERED');
      expect(lane.stageIndex).toBe(2);
    });

    it('finishes after all 14 shots in 2nd Stage', () => {
      let lane = createFinalLane();
      lane = lane.startPreparation().advanceToNextStage().startMatch();
      lane = addShots(lane, 5, 10.0);
      lane = lane.startMatch();
      lane = addShots(lane, 5, 10.0);

      // 2nd Stage: 14 single-shot series (mode: shot)
      lane = lane.advanceToNextStage().startMatch();
      lane = addShotsWithMatchResume(lane, 14, 10.0);
      expect(lane.phase).toBe('FINISHED');
      expect(lane.matchShots).toHaveLength(24);
      expect(lane.totalScore).toBe(240);
    });
  });

  describe('50m 3 Positions Final: shared-time position block', () => {
    it('keeps the 22-minute timer through Kneeling, Prone and Standing sighting without a phantom score series', () => {
      let lane = create50mFinalLane().startPreparation().advanceToNextStage().startMatch();
      lane = lane.tickTimer(60);
      lane = addShots(lane, 20, 10);

      expect(lane).toMatchObject({ phase: 'ACTIVE', stageIndex: 1, seriesIndex: 2 });
      expect(lane.remainingTime).toBe(1260);
      expect(lane.currentSeries).toMatchObject({
        shots: 0,
        purpose: 'POSITION_CHANGE_AND_SIGHTING',
      });
      expect(lane.matchShots.slice(0, 10).every((shot) => shot.seriesNumber === 1)).toBe(true);
      expect(lane.matchShots.slice(10).every((shot) => shot.seriesNumber === 2)).toBe(true);
      expect(() => lane.addShotByScore(10, Date.now(), 21)).toThrow('position change and sighting');

      lane = lane.tickTimer(1260).advanceToNextStage().startMatch();
      lane = addShots(lane, 5, 10);
      expect(lane.matchShots.slice(20).every((shot) => shot.seriesNumber === 3)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------

  describe('Shot mode: SHOT_COMPLETE transitions', () => {
    it('transitions to SHOT_COMPLETE after the first shot in 2nd Stage', () => {
      let lane = createMultiShotSeriesFinalLane();
      lane = lane.startPreparation().advanceToNextStage().startMatch();
      lane = addShots(lane, 5, 10.0);
      lane = lane.startMatch();
      lane = addShots(lane, 5, 10.0);
      // 2nd Stage
      lane = lane.advanceToNextStage().startMatch();
      const absNum = lane.matchShots.length + lane.preparationShots.length + 1;
      lane = lane.addShotByScore(10.0, Date.now(), absNum);
      expect(lane.phase).toBe('SHOT_COMPLETE');
      expect(lane.timer).toBeNull();
    });

    it('resumes the timer and transitions to ACTIVE when startMatch is called from SHOT_COMPLETE', () => {
      let lane = createMultiShotSeriesFinalLane();
      lane = lane.startPreparation().advanceToNextStage().startMatch();
      lane = addShots(lane, 5, 10.0);
      lane = lane.startMatch();
      lane = addShots(lane, 5, 10.0);
      lane = lane.advanceToNextStage().startMatch();
      const absNum = lane.matchShots.length + lane.preparationShots.length + 1;
      lane = lane.addShotByScore(10.0, Date.now(), absNum);
      expect(lane.phase).toBe('SHOT_COMPLETE');

      lane = lane.startMatch();
      expect(lane.phase).toBe('ACTIVE');
      expect(lane.timer).not.toBeNull();
      expect(lane.remainingTime).toBe(50);
    });

    it('rejects addShotByScore while SHOT_COMPLETE', () => {
      let lane = createMultiShotSeriesFinalLane();
      lane = lane.startPreparation().advanceToNextStage().startMatch();
      lane = addShots(lane, 5, 10.0);
      lane = lane.startMatch();
      lane = addShots(lane, 5, 10.0);
      lane = lane.advanceToNextStage().startMatch();
      const absNum = lane.matchShots.length + lane.preparationShots.length + 1;
      lane = lane.addShotByScore(10.0, Date.now(), absNum);
      expect(lane.phase).toBe('SHOT_COMPLETE');
      expect(() => lane.addShotByScore(10.0, Date.now(), absNum + 1)).toThrow();
    });

    it('transitions from SHOT_COMPLETE to FINISHED with finish', () => {
      let lane = createMultiShotSeriesFinalLane();
      lane = lane.startPreparation().advanceToNextStage().startMatch();
      lane = addShots(lane, 5, 10.0);
      lane = lane.startMatch();
      lane = addShots(lane, 5, 10.0);
      lane = lane.advanceToNextStage().startMatch();
      const absNum = lane.matchShots.length + lane.preparationShots.length + 1;
      lane = lane.addShotByScore(10.0, Date.now(), absNum);
      expect(lane.phase).toBe('SHOT_COMPLETE');
      lane = lane.finish();
      expect(lane.phase).toBe('FINISHED');
    });

    it('rejects advanceToNextStage from SHOT_COMPLETE in the final stage', () => {
      let lane = createMultiShotSeriesFinalLane();
      lane = lane.startPreparation().advanceToNextStage().startMatch();
      lane = addShots(lane, 5, 10.0);
      lane = lane.startMatch();
      lane = addShots(lane, 5, 10.0);
      lane = lane.advanceToNextStage().startMatch();
      const absNum = lane.matchShots.length + lane.preparationShots.length + 1;
      lane = lane.addShotByScore(10.0, Date.now(), absNum);
      expect(lane.phase).toBe('SHOT_COMPLETE');
      expect(() => lane.advanceToNextStage()).toThrow();
    });

    it('transitions to SHOT_COMPLETE when a Shot mode timer expires', () => {
      let lane = createMultiShotSeriesFinalLane();
      lane = lane.startPreparation().advanceToNextStage().startMatch();
      lane = addShots(lane, 5, 10.0);
      lane = lane.startMatch();
      lane = addShots(lane, 5, 10.0);
      lane = lane.advanceToNextStage().startMatch();
      let current = lane;
      while (current.remainingTime > 0) {
        current = current.tickTimer();
      }
      current = current.tickTimer();
      expect(current.phase).toBe('SHOT_COMPLETE');
      expect(current.timer).toBeNull();
      expect(current.matchShots).toHaveLength(11);
      expect(current.matchShots[10]?.score.value).toBe(0);
      expect(current.matchShots[10]?.disposition).toBe('MISS');
    });

    it('keeps later shots in their declared slot after a Shot mode timeout', () => {
      let lane = createMultiShotSeriesFinalLane();
      lane = lane.startPreparation().advanceToNextStage().startMatch();
      lane = addShots(lane, 5, 10.0);
      lane = lane.startMatch();
      lane = addShots(lane, 5, 10.0);
      lane = lane.advanceToNextStage().startMatch();

      lane = exhaustTimer(lane);
      lane = lane.startMatch();
      const receivedShotNumber = lane.preparationShots.length + 11;
      lane = lane.addShotByScore(10.7, Date.now(), receivedShotNumber);

      expect(lane.getSeriesScores(2, 0)).toEqual([0, 10.7]);
      expect(lane.matchShots[10]?.disposition).toBe('MISS');
      expect(lane.matchShots[11]?.disposition).toBe('SCORED');
    });

    it('restores legacy snapshots without dispositions as scored slots', () => {
      let lane = createMultiShotSeriesFinalLane();
      lane = lane.startPreparation().advanceToNextStage().startMatch();
      lane = addShots(lane, 2, 10.0);
      const snapshot = lane.toSnapshot();
      const legacySnapshot = {
        ...snapshot,
        matchShots: snapshot.matchShots.map(({ disposition: _disposition, ...shot }) => shot),
      };

      const restored = LaneControl.fromSnapshot(legacySnapshot);

      expect(restored.matchShots.map((shot) => shot.disposition)).toEqual(['SCORED', 'SCORED']);
    });
  });

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------

  describe('Shootoff flow', () => {
    it('SERIES_COMPLETE → SHOOTOFF → resolveShootoff → SERIES_COMPLETE', () => {
      let lane = createFinalLane();
      lane = lane.startPreparation().advanceToNextStage().startMatch();
      lane = addShots(lane, 5, 10.0);
      expect(lane.phase).toBe('SERIES_COMPLETE');

      lane = lane.startShootoff();
      expect(lane.phase).toBe('SHOOTOFF');
      expect(lane.remainingTime).toBe(50);
      expect(lane.shootoffShots).toEqual([]);

      lane = lane.addShootoffShot(10.5);
      expect(lane.shootoffShots).toHaveLength(1);
      expect(lane.shootoffShots[0]!.score.value).toBe(10.5);
      expect(lane.phase).toBe('SHOOTOFF');

      lane = lane.resolveShootoff();
      expect(lane.phase).toBe('SERIES_COMPLETE');
      expect(lane.shootoffShots).toHaveLength(1);
    });

    it('resets shootoffShots when SHOOTOFF starts', () => {
      let lane = createFinalLane();
      lane = lane.startPreparation().advanceToNextStage().startMatch();
      lane = addShots(lane, 5, 10.0);

      lane = lane.startShootoff();
      lane = lane.addShootoffShot(9.0);
      lane = lane.resolveShootoff();

      lane = lane.startShootoff();
      expect(lane.shootoffShots).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------

  describe('invalid state transitions', () => {
    it('rejects startMatch directly from IDLE', () => {
      const lane = createQualificationLane();
      expect(() => lane.startMatch()).toThrow();
    });

    it('rejects advanceToNextStage directly from IDLE', () => {
      const lane = createQualificationLane();
      expect(() => lane.advanceToNextStage()).toThrow();
    });

    it('rejects finish directly from IDLE', () => {
      const lane = createQualificationLane();
      expect(() => lane.finish()).toThrow();
    });

    it('rejects addShotByScore from IDLE', () => {
      const lane = createQualificationLane();
      expect(() => lane.addShotByScore(10.0, Date.now(), 1)).toThrow();
    });

    it('rejects startPreparation from FINISHED', () => {
      let lane = createQualificationLane().startPreparation();
      lane = lane.advanceToNextStage().startMatch();
      lane = lane.finish();
      expect(lane.phase).toBe('FINISHED');
      expect(() => lane.startPreparation()).toThrow();
    });

    it('rejects startMatch from FINISHED', () => {
      let lane = createQualificationLane().startPreparation();
      lane = lane.advanceToNextStage().startMatch();
      lane = lane.finish();
      expect(() => lane.startMatch()).toThrow();
    });

    it('rejects startPreparation from ACTIVE', () => {
      const lane = createQualificationLane().startPreparation();
      expect(() => lane.startPreparation()).toThrow();
    });

    it('allows startShootoff from SERIES_COMPLETE but not from IDLE', () => {
      const idle = createFinalLane();
      expect(() => idle.startShootoff()).toThrow();
    });

    it('rejects startShootoff from ACTIVE', () => {
      const lane = createFinalLane().startPreparation();
      expect(() => lane.startShootoff()).toThrow();
    });

    it('rejects resolveShootoff outside SHOOTOFF', () => {
      let lane = createFinalLane();
      lane = lane.startPreparation().advanceToNextStage().startMatch();
      lane = addShots(lane, 5, 10.0);
      expect(lane.phase).toBe('SERIES_COMPLETE');
      expect(() => lane.resolveShootoff()).toThrow();
    });

    it('rejects addShootoffShot outside SHOOTOFF', () => {
      const lane = createFinalLane();
      expect(() => lane.addShootoffShot(10.0)).toThrow();
    });

    it('rejects startMatch from SERIES_COMPLETE when the stage has no next series', () => {
      let lane = createFinalLane();
      lane = lane.startPreparation().advanceToNextStage().startMatch();
      lane = addShots(lane, 5, 10.0);
      // Series 2:
      lane = lane.startMatch();
      lane = addShots(lane, 5, 10.0);
      expect(lane.phase).toBe('SERIES_COMPLETE');
      expect(() => lane.startMatch()).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------

  describe('score calculations', () => {
    it('totalScore returns the sum of all shots', () => {
      let lane = createQualificationLane().startPreparation();
      lane = lane.advanceToNextStage().startMatch();
      lane = addShots(lane, 10, 10.5);
      expect(lane.totalScore).toBe(105);
    });

    it('seriesScores returns subtotals for each 10 shots', () => {
      let lane = createQualificationLane().startPreparation();
      lane = lane.advanceToNextStage().startMatch();
      lane = addShots(lane, 10, 10.0);
      lane = addShots(lane, 10, 9.0);
      const series = lane.seriesScores;
      expect(series[0]).toBe(100);
      expect(series[1]).toBe(90);
      expect(series[2]).toBe(0);
    });

    it('lastScore returns the final shot score', () => {
      let lane = createQualificationLane().startPreparation();
      lane = lane.advanceToNextStage().startMatch();
      lane = lane.addShotByScore(9.5, Date.now(), 1);
      expect(lane.lastScore).toBe(9.5);
      lane = lane.addShotByScore(10.3, Date.now(), 2);
      expect(lane.lastScore).toBe(10.3);
    });

    it('lastScore returns the last sighting shot during Preparation', () => {
      let lane = createQualificationLane().startPreparation();
      lane = lane.addShotByScore(8.0, Date.now(), 1);
      expect(lane.lastScore).toBe(8.0);
    });

    it('lastScore returns null when there are no shots', () => {
      const lane = createQualificationLane();
      expect(lane.lastScore).toBeNull();
    });

    it('recentShots returns up to 10 shots from the current series', () => {
      let lane = createQualificationLane().startPreparation();
      lane = lane.advanceToNextStage().startMatch();
      lane = addShots(lane, 13, 10.0);
      const recent = lane.recentShots;
      expect(recent).toHaveLength(3);
      expect(recent.every((s) => s === 10.0)).toBe(true);
    });

    it('Final: stage1Total / stage2Total', () => {
      let lane = createFinalLane();
      lane = lane.startPreparation().advanceToNextStage().startMatch();
      lane = addShots(lane, 5, 10.0);
      lane = lane.startMatch();
      lane = addShots(lane, 5, 10.0);
      expect(lane.stage1Total).toBe(100);
      expect(lane.stage2Total).toBe(0);

      lane = lane.advanceToNextStage().startMatch();
      lane = addShotsWithMatchResume(lane, 2, 9.0);
      expect(lane.stage2Total).toBe(18);
    });

    it('currentSeriesShotCount returns the shot count in the current series', () => {
      let lane = createQualificationLane().startPreparation();
      lane = lane.advanceToNextStage().startMatch();
      expect(lane.currentSeriesShotCount).toBe(0);
      lane = addShots(lane, 5, 10.0);
      expect(lane.currentSeriesShotCount).toBe(5);
    });

    it('currentSeriesShotCount handles a previous series that ended early on timeout', () => {
      let lane = createFinalLane();
      lane = lane.startPreparation().advanceToNextStage().startMatch();

      lane = addShots(lane, 3, 10.0);
      expect(lane.matchShots).toHaveLength(3);
      lane = exhaustTimer(lane);
      expect(lane.phase).toBe('SERIES_COMPLETE');
      expect(lane.matchShots).toHaveLength(5);
      expect(lane.matchShots.slice(3).every((shot) => shot.disposition === 'MISS')).toBe(true);

      lane = lane.startMatch();
      expect(lane.stageIndex).toBe(1);
      expect(lane.seriesIndex).toBe(1);
      lane = addShots(lane, 2, 9.0);
      expect(lane.matchShots).toHaveLength(7);

      expect(lane.currentSeriesShotCount).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------

  describe('player management', () => {
    it('assigns an athlete with assignPlayer', () => {
      const lane = createQualificationLane();
      const player = Player.create('Alex Smith', 'Tokyo Branch');
      const assigned = lane.assignPlayer(player);
      expect(assigned.player).not.toBeNull();
      expect(assigned.player!.name).toBe('Alex Smith');
      expect(assigned.player!.affiliation).toBe('Tokyo Branch');
    });

    it('clears the athlete and resets the Lane from IDLE', () => {
      const lane = createQualificationLane();
      const assigned = lane.assignPlayer(Player.create('Athlete A', 'Affiliation A'));
      const cleared = assigned.clearPlayer();
      expect(cleared.player).toBeNull();
      expect(cleared.phase).toBe('IDLE');
    });

    it('rejects clearPlayer while ACTIVE', () => {
      let lane = createQualificationLane();
      lane = lane.assignPlayer(Player.create('Athlete A', 'Affiliation A'));
      lane = lane.startPreparation();
      expect(() => lane.clearPlayer()).toThrow();
    });

    it('resets the Lane when clearPlayer is called from FINISHED', () => {
      let lane = createQualificationLane();
      lane = lane.assignPlayer(Player.create('Athlete A', 'Affiliation A'));
      lane = lane.startPreparation().advanceToNextStage().startMatch();
      lane = lane.finish();
      const cleared = lane.clearPlayer();
      expect(cleared.phase).toBe('IDLE');
      expect(cleared.matchShots).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------

  describe('shot editing', () => {
    it('changes a score with updateShot', () => {
      let lane = createQualificationLane().startPreparation();
      lane = lane.advanceToNextStage().startMatch();
      lane = addShots(lane, 3, 10.0);
      const updated = lane.updateShot(1, 9.0, 'MATCH');
      expect(updated.matchShots[1]!.score.value).toBe(9.0);
      expect(updated.totalScore).toBe(29); // 10 + 9 + 10
    });

    it('deletes a shot with removeShot', () => {
      let lane = createQualificationLane().startPreparation();
      lane = lane.advanceToNextStage().startMatch();
      lane = addShots(lane, 3, 10.0);
      const removed = lane.removeShot(1, 'MATCH');
      expect(removed.matchShots).toHaveLength(2);
      expect(removed.matchShots[0]!.shotNumber.value).toBe(1);
      expect(removed.matchShots[1]!.shotNumber.value).toBe(2);
    });

    it('inserts a shot with insertShot', () => {
      let lane = createQualificationLane().startPreparation();
      lane = lane.advanceToNextStage().startMatch();
      lane = addShots(lane, 2, 10.0);
      const inserted = lane.insertShot(1, 5.0, 'MATCH');
      expect(inserted.matchShots).toHaveLength(3);
      expect(inserted.matchShots[1]!.score.value).toBe(5.0);
      expect(inserted.matchShots[0]!.shotNumber.value).toBe(1);
      expect(inserted.matchShots[1]!.shotNumber.value).toBe(2);
      expect(inserted.matchShots[2]!.shotNumber.value).toBe(3);
    });

    it('rejects updateShot from IDLE', () => {
      const lane = createQualificationLane();
      expect(() => lane.updateShot(0, 9.0, 'MATCH')).toThrow();
    });

    it('rejects updateShot with an out-of-range index', () => {
      let lane = createQualificationLane().startPreparation();
      lane = lane.advanceToNextStage().startMatch();
      lane = addShots(lane, 2, 10.0);
      expect(() => lane.updateShot(5, 9.0, 'MATCH')).toThrow();
      expect(() => lane.updateShot(-1, 9.0, 'MATCH')).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------

  describe('timer', () => {
    it('decreases remaining time with tickTimer', () => {
      const lane = createQualificationLane().startPreparation();
      const ticked = lane.tickTimer();
      expect(ticked.remainingTime).toBe(599);
    });

    it('decreases remaining time by elapsedSeconds', () => {
      const lane = createQualificationLane().startPreparation();
      const ticked = lane.tickTimer(10);
      expect(ticked.remainingTime).toBe(590);
    });

    it('returns itself from tickTimer without a timer in IDLE', () => {
      const lane = createQualificationLane();
      const same = lane.tickTimer();
      expect(same).toBe(lane);
    });

    it('returns itself from tickTimer in SHOT_COMPLETE as a no-op', () => {
      let lane = createMultiShotSeriesFinalLane();
      lane = lane.startPreparation().advanceToNextStage().startMatch();
      lane = addShots(lane, 5, 10.0);
      lane = lane.startMatch();
      lane = addShots(lane, 5, 10.0);
      lane = lane.advanceToNextStage().startMatch();
      const absNum = lane.matchShots.length + lane.preparationShots.length + 1;
      lane = lane.addShotByScore(10.0, Date.now(), absNum);
      expect(lane.phase).toBe('SHOT_COMPLETE');
      const same = lane.tickTimer();
      expect(same).toBe(lane);
    });
  });

  // ---------------------------------------------------------------------------
  // Elimination (Final)
  // ---------------------------------------------------------------------------

  describe('Elimination', () => {
    it('sets the elimination flag and rank with eliminate', () => {
      const lane = createFinalLane();
      const eliminated = lane.eliminate(3);
      expect(eliminated.eliminated).toBe(true);
      expect(eliminated.eliminationRank).toBe(3);
    });

    it('rejects a rank below 1', () => {
      const lane = createFinalLane();
      expect(() => lane.eliminate(0)).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // withConfig
  // ---------------------------------------------------------------------------

  describe('withConfig', () => {
    it('allows config replacement in IDLE', () => {
      const lane = createQualificationLane();
      const finalConfig = buildFinalConfig(8);
      const changed = lane.withConfig(finalConfig);
      expect(changed.config.roundType).toBe('Final');
    });

    it('rejects withConfig outside IDLE', () => {
      const lane = createQualificationLane().startPreparation();
      expect(() => lane.withConfig(QUALIFICATION_CONFIG)).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // transferDataFrom
  // ---------------------------------------------------------------------------

  describe('transferDataFrom', () => {
    it('inherits data from the source Lane', () => {
      let source = createQualificationLane(1);
      source = source.assignPlayer(Player.create('Athlete A', 'Affiliation A'));
      source = source.startPreparation().advanceToNextStage().startMatch();
      source = addShots(source, 5, 10.0);

      const target = createQualificationLane(2);
      const transferred = target.transferDataFrom(source);

      expect(transferred.id).toBe('lane-2');
      expect(transferred.player!.name).toBe('Athlete A');
      expect(transferred.matchShots).toHaveLength(5);
      expect(transferred.phase).toBe('ACTIVE');
    });
  });

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------

  describe('duplicate shot detection', () => {
    it('detects a duplicate receivedShotNumber', () => {
      let lane = createQualificationLane().startPreparation();
      lane = lane.advanceToNextStage().startMatch();
      lane = lane.addShotByScore(10.0, Date.now(), 42);
      expect(lane.isDuplicateShot(42)).toBe(true);
      expect(lane.isDuplicateShot(43)).toBe(false);
    });

    it('has no duplicates initially', () => {
      const lane = createQualificationLane();
      expect(lane.isDuplicateShot(1)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------

  describe('button conditions', () => {
    it('canStartPreparation is true only in IDLE', () => {
      const idle = createQualificationLane();
      expect(idle.canStartPreparation).toBe(true);

      const active = idle.startPreparation();
      expect(active.canStartPreparation).toBe(false);
    });

    it('canAdvanceToNextStage is true when another stage exists', () => {
      const lane = createQualificationLane().startPreparation();
      expect(lane.canAdvanceToNextStage).toBe(true);
    });

    it('canStartMatch is true in STAGE_ENTERED', () => {
      const lane = createQualificationLane().startPreparation().advanceToNextStage();
      expect(lane.phase).toBe('STAGE_ENTERED');
      expect(lane.canStartMatch).toBe(true);
    });

    it('canFinish is true in ACTIVE and SERIES_COMPLETE', () => {
      const active = createQualificationLane().startPreparation();
      expect(active.canFinish).toBe(true);

      const idle = createQualificationLane();
      expect(idle.canFinish).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------

  describe('presentation getters', () => {
    it('displayShots returns preparationShots during Preparation', () => {
      let lane = createQualificationLane().startPreparation();
      lane = lane.addShotByScore(9.0, Date.now(), 1);
      expect(lane.displayShots).toHaveLength(1);
      expect(lane.displayShots[0]!.score.value).toBe(9.0);
    });

    it('displayShots returns matchShots during Match', () => {
      let lane = createQualificationLane().startPreparation();
      lane = lane.advanceToNextStage().startMatch();
      lane = addShots(lane, 3, 10.0);
      expect(lane.displayShots).toHaveLength(3);
    });

    it('displayShotCount / displayTotalScore', () => {
      let lane = createQualificationLane().startPreparation();
      lane = lane.advanceToNextStage().startMatch();
      lane = addShots(lane, 5, 10.0);
      expect(lane.displayShotCount).toBe(5);
      expect(lane.displayTotalScore).toBe(50);
    });

    it('currentStageName returns the stage name for the current phase', () => {
      let lane = createFinalLane();
      lane = lane.startPreparation();
      expect(lane.currentStageName).toBe('Preparation and sighting');

      lane = lane.advanceToNextStage().startMatch();
      expect(lane.currentStageName).toBe('1st Stage');
    });
  });
});
