// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it } from 'vitest';

import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Session } from '@/main/modules/session/domain/Session';
import { DomainError } from '@/shared/errors/DomainError';

describe('Session', () => {
  let discipline: Discipline;

  beforeEach(() => {
    discipline = Discipline.airRifle10m();
  });

  describe('basic feature: session creation', () => {
    it('creates a new session', () => {
      const session = Session.create(discipline);

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.discipline.equals(discipline)).toBe(true);
      expect(session.mode.isSighting()).toBe(true); // default is sighting mode
      expect(session.series).toHaveLength(1); // first series is created
      expect(session.allShots).toHaveLength(0);
      expect(session.startedAt).toBeInstanceOf(Date);
      expect(session.finishedAt).toBeNull();
      expect(session.isFinished).toBe(false);
    });

    it('created sessions have unique IDs', () => {
      const session1 = Session.create(discipline);
      const session2 = Session.create(discipline);

      expect(session1.id).not.toBe(session2.id);
    });

    it('creation timestamp is recorded correctly', () => {
      const before = new Date();
      const session = Session.create(discipline);
      const after = new Date();

      expect(session.startedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(session.startedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('basic feature: recording shots', () => {
    it('can record a shot', () => {
      const session = Session.create(discipline);
      const impactPoint = new ImpactPoint(1.5, 2.3);
      const score = new Score(105);

      const updatedSession = session.recordShot(impactPoint, score, new Date());

      expect(updatedSession.allShots).toHaveLength(1);
      expect(updatedSession.shotCount).toBe(1);
      expect(updatedSession.allShots[0]?.score.equals(score)).toBe(true);
      expect(updatedSession.allShots[0]?.impactPoint?.equals(impactPoint)).toBe(true);
      expect(updatedSession.allShots[0]?.mode.equals(session.mode)).toBe(true);
    });

    it('can record multiple shots consecutively', () => {
      let session = Session.create(discipline);

      const shot1 = { impactPoint: new ImpactPoint(1.0, 1.0), score: new Score(105) };
      const shot2 = { impactPoint: new ImpactPoint(2.0, 2.0), score: new Score(103) };
      const shot3 = { impactPoint: new ImpactPoint(3.0, 3.0), score: new Score(101) };

      session = session.recordShot(shot1.impactPoint, shot1.score, new Date());
      session = session.recordShot(shot2.impactPoint, shot2.score, new Date());
      session = session.recordShot(shot3.impactPoint, shot3.score, new Date());

      expect(session.shotCount).toBe(3);
      expect(session.allShots).toHaveLength(3);
    });

    it('original session instance is not mutated (immutability)', () => {
      const session = Session.create(discipline);
      const originalShotCount = session.shotCount;

      session.recordShot(new ImpactPoint(1.0, 1.0), new Score(105), new Date());

      expect(session.shotCount).toBe(originalShotCount);
    });

    it('shot numbers are assigned automatically', () => {
      let session = Session.create(discipline);

      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(105), new Date());
      session = session.recordShot(new ImpactPoint(2.0, 2.0), new Score(103), new Date());

      expect(session.allShots[0]?.shotNumber).toBe(1);
      expect(session.allShots[1]?.shotNumber).toBe(2);
    });
  });

  describe('basic feature: mode switching', () => {
    it('can switch from sighting mode to match mode', () => {
      let session = Session.create(discipline);
      expect(session.mode.isSighting()).toBe(true);

      session = session.switchMode(Mode.match());

      expect(session.mode.isMatch()).toBe(true);
    });

    it('can switch from match mode to sighting mode', () => {
      let session = Session.create(discipline);
      session = session.switchMode(Mode.match());

      session = session.switchMode(Mode.sighting());

      expect(session.mode.isSighting()).toBe(true);
    });

    it('a new series starts when the mode is switched', () => {
      let session = Session.create(discipline);
      const initialSeriesCount = session.series.length;

      session = session.switchMode(Mode.match());

      expect(session.series.length).toBe(initialSeriesCount + 1);
    });

    it('shots recorded after a mode switch use the new mode', () => {
      let session = Session.create(discipline);
      session = session.switchMode(Mode.match());

      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(105), new Date());

      expect(session.allShots[0]?.mode.isMatch()).toBe(true);
    });
  });

  describe('computed property: totalScore', () => {
    it('only match shots are summed', () => {
      let session = Session.create(discipline);

      // 2 shots in sighting mode
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(105), new Date());
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(103), new Date());

      // switch to match mode
      session = session.switchMode(Mode.match());

      // 3 shots in match mode
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(102), new Date());
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(101), new Date());
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(100), new Date());

      // match total: 10.2 + 10.1 + 10.0 = 30.3
      expect(session.totalScore).toBe(303);
    });

    it('totalScore is 0 when there are only sighting shots', () => {
      let session = Session.create(discipline);

      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(105), new Date());
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(103), new Date());

      expect(session.totalScore).toBe(0);
    });

    it('totalScore is 0 when there are no shots', () => {
      const session = Session.create(discipline);

      expect(session.totalScore).toBe(0);
    });
  });

  describe('computed property: shotCount', () => {
    it('returns the total number of shots', () => {
      let session = Session.create(discipline);

      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(105), new Date());
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(103), new Date());
      session = session.switchMode(Mode.match());
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(102), new Date());

      expect(session.shotCount).toBe(3);
    });
  });

  describe('computed property: currentSeries', () => {
    it('returns the current series', () => {
      const session = Session.create(discipline);

      expect(session.currentSeries).toBeDefined();
      expect(session.currentSeries?.seriesNumber).toBe(1);
    });

    it('can get the current series after recording shots', () => {
      let session = Session.create(discipline);
      session = session.switchMode(Mode.match()); // switch to match mode

      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(105), new Date());

      expect(session.currentSeries).toBeDefined();
      expect(session.currentSeries?.count).toBe(1);
    });
  });

  describe('computed properties: matchShots and sightingShots', () => {
    it('matchShots returns only match shots', () => {
      let session = Session.create(discipline);

      // 2 sighting shots
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(105), new Date());
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(103), new Date());

      // switch to match and record 3 shots
      session = session.switchMode(Mode.match());
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(102), new Date());
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(101), new Date());
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(100), new Date());

      expect(session.matchShots).toHaveLength(3);
      expect(session.matchShots.every((shot) => shot.mode.isMatch())).toBe(true);
    });

    it('sightingShots returns only sighting shots', () => {
      let session = Session.create(discipline);

      // 2 sighting shots
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(105), new Date());
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(103), new Date());

      // switch to match and record 3 shots
      session = session.switchMode(Mode.match());
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(102), new Date());
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(101), new Date());
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(100), new Date());

      expect(session.sightingShots).toHaveLength(2);
      expect(session.sightingShots.every((shot) => shot.mode.isSighting())).toBe(true);
    });
  });

  describe('business rule: automatic series switch after 10 shots', () => {
    it('a new series starts after 10 shots in match mode', () => {
      let session = Session.create(discipline);
      session = session.switchMode(Mode.match());

      const initialSeriesNumber = session.currentSeries?.seriesNumber ?? 0;

      // record 10 shots
      for (let i = 0; i < 10; i++) {
        session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(100), new Date());
      }

      // the 11th shot starts a new series
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(100), new Date());

      expect(session.currentSeries?.seriesNumber).toBe(initialSeriesNumber + 1);
      expect(session.series).toHaveLength(3); // initial sighting series + match series 1 + match series 2
    });

    it('series does not switch after 10 shots in sighting mode', () => {
      let session = Session.create(discipline);

      const initialSeriesNumber = session.currentSeries?.seriesNumber ?? 0;

      // record 15 shots in sighting mode
      for (let i = 0; i < 15; i++) {
        session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(100), new Date());
      }

      // series does not switch in sighting mode
      expect(session.currentSeries?.seriesNumber).toBe(initialSeriesNumber);
      expect(session.series).toHaveLength(1);
    });

    it('the second series is complete after 20 shots', () => {
      let session = Session.create(discipline);
      session = session.switchMode(Mode.match());

      // record 20 shots
      for (let i = 0; i < 20; i++) {
        session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(100), new Date());
      }

      // initial sighting series + match series 1 (complete) + match series 2 (complete)
      expect(session.series).toHaveLength(3);
      expect(session.series[1]?.isComplete).toBe(true);
      expect(session.series[2]?.isComplete).toBe(true);
    });

    it('the 3rd series starts on the 21st shot', () => {
      let session = Session.create(discipline);
      session = session.switchMode(Mode.match());

      // record 21 shots
      for (let i = 0; i < 21; i++) {
        session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(100), new Date());
      }

      // initial sighting series + match series 1 (complete) + match series 2 (complete) + match series 3 (1 shot)
      expect(session.series).toHaveLength(4);
      expect(session.currentSeries?.count).toBe(1);
    });
  });

  describe('business rule: finished sessions', () => {
    it('can finish a session', () => {
      let session = Session.create(discipline);
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(105), new Date());

      session = session.finish();

      expect(session.isFinished).toBe(true);
      expect(session.finishedAt).toBeInstanceOf(Date);
    });

    it('finish time is after start time', () => {
      let session = Session.create(discipline);
      session = session.finish();

      expect(session.finishedAt).not.toBeNull();
      expect(session.finishedAt!.getTime()).toBeGreaterThanOrEqual(session.startedAt.getTime());
    });

    it('cannot add new shots to a finished session', () => {
      let session = Session.create(discipline);
      session = session.finish();

      try {
        session.recordShot(new ImpactPoint(1.0, 1.0), new Score(105), new Date());
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('SESSION_ALREADY_FINISHED');
      }
    });

    it('cannot switch mode on a finished session', () => {
      let session = Session.create(discipline);
      session = session.finish();

      try {
        session.switchMode(Mode.match());
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('SESSION_ALREADY_FINISHED');
      }
    });

    it('cannot reset a finished session', () => {
      let session = Session.create(discipline);
      session = session.finish();

      try {
        session.resetSeries();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('SESSION_ALREADY_FINISHED');
      }
    });
  });

  describe('edge case: empty session', () => {
    it('total score of an empty session is 0', () => {
      const session = Session.create(discipline);

      expect(session.totalScore).toBe(0);
    });

    it('shot count of an empty session is 0', () => {
      const session = Session.create(discipline);

      expect(session.shotCount).toBe(0);
    });

    it('can finish an empty session', () => {
      let session = Session.create(discipline);
      session = session.finish();

      expect(session.isFinished).toBe(true);
    });
  });

  describe('edge case: reset feature', () => {
    it('can reset the current series', () => {
      let session = Session.create(discipline);

      // record 3 shots
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(105), new Date());
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(103), new Date());
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(101), new Date());

      session = session.resetSeries();

      // current series is reset and empty
      expect(session.currentSeries?.count).toBe(0);
      // all shot history is preserved
      expect(session.allShots).toHaveLength(3);
    });

    it('can add new shots after a reset', () => {
      let session = Session.create(discipline);
      session = session.switchMode(Mode.match()); // switch to match mode

      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(105), new Date());
      session = session.resetSeries();
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(103), new Date());

      expect(session.currentSeries?.count).toBe(1);
      expect(session.allShots).toHaveLength(2);
    });

    it('a new series number is assigned after a reset in match mode', () => {
      let session = Session.create(discipline);
      session = session.switchMode(Mode.match());

      const initialSeriesNumber = session.currentSeries?.seriesNumber ?? 0;

      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(105), new Date());
      session = session.resetSeries();

      expect(session.currentSeries?.seriesNumber).toBe(initialSeriesNumber + 1);
    });
  });

  describe('entity equality', () => {
    it('Sessions with the same ID are equal', () => {
      const session1 = Session.create(discipline);
      const session2 = session1.recordShot(new ImpactPoint(1.0, 1.0), new Score(105), new Date());

      // ID does not change, so they are equal
      expect(session1.equals(session2)).toBe(true);
    });

    it('Sessions with different IDs are not equal', () => {
      const session1 = Session.create(discipline);
      const session2 = Session.create(discipline);

      expect(session1.equals(session2)).toBe(false);
    });
  });

  describe('invariant: at least 1 series required', () => {
    it('throws an INVALID_SESSION_STATE error when reconstructing a Session with an empty series array', () => {
      expect(() =>
        Session.reconstruct({
          id: 'test-id',
          discipline,
          mode: Mode.sighting(),
          series: [],
          allShots: [],
          startedAt: new Date(),
          finishedAt: null,
        }),
      ).toThrow(
        expect.objectContaining({
          code: 'INVALID_SESSION_STATE',
        }),
      );
    });
  });

  describe('invariant: series seriesNumbers start at 1 and are sequential', () => {
    it('the first series number is 1', () => {
      const session = Session.create(discipline);

      expect(session.series[0]?.seriesNumber).toBe(1);
    });

    it('series numbers increment sequentially', () => {
      let session = Session.create(discipline);
      session = session.switchMode(Mode.match());

      // fire 10 shots to complete the series
      for (let i = 0; i < 10; i++) {
        session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(100), new Date());
      }

      // fire 1 more shot to create a new series
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(100), new Date());

      const seriesNumbers = session.series.map((s) => s.seriesNumber);
      expect(seriesNumbers).toEqual([1, 2, 3]);
    });
  });

  describe('complex scenario: sighting → match → sighting → match', () => {
    it('works correctly with multiple mode switches', () => {
      let session = Session.create(discipline);

      // 3 shots in sighting mode
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(105), new Date());
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(103), new Date());
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(101), new Date());

      // switch to match and record 5 shots
      session = session.switchMode(Mode.match());
      for (let i = 0; i < 5; i++) {
        session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(100), new Date());
      }

      // switch back to sighting and record 2 shots
      session = session.switchMode(Mode.sighting());
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(102), new Date());
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(101), new Date());

      // switch back to match and record 3 shots
      session = session.switchMode(Mode.match());
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(98), new Date());
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(97), new Date());
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(96), new Date());

      expect(session.shotCount).toBe(13);
      expect(session.sightingShots).toHaveLength(5);
      expect(session.matchShots).toHaveLength(8);
      expect(session.totalScore).toBe(100 * 5 + 98 + 97 + 96); // 791
    });
  });

  describe('shot seriesNumber', () => {
    it('sighting shots have seriesNumber = 0', () => {
      let session = Session.create(discipline);

      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(100), new Date());

      expect(session.allShots[0]?.seriesNumber).toBe(0);
    });

    it('match shots have the current series number', () => {
      let session = Session.create(discipline);
      session = session.switchMode(Mode.match());

      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(100), new Date());

      expect(session.allShots[0]?.seriesNumber).toBe(2); // series 2 (after sighting series 1)
    });

    it('shots after series completion have the new series number', () => {
      let session = Session.create(discipline);
      session = session.switchMode(Mode.match());

      // record 10 shots (complete series)
      for (let i = 0; i < 10; i++) {
        session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(100), new Date());
      }

      // 11th shot
      session = session.recordShot(new ImpactPoint(1.0, 1.0), new Score(100), new Date());

      expect(session.allShots[10]?.seriesNumber).toBe(3); // new series
    });

    it('shots have the correct seriesNumber even when the same score appears in multiple series', () => {
      let session = Session.create(discipline);
      session = session.switchMode(Mode.match());

      // series 1: 10 shots including a score of 10.4
      session = session.recordShot(new ImpactPoint(0, 0), new Score(104), new Date());
      for (let i = 1; i < 10; i++) {
        session = session.recordShot(new ImpactPoint(0, 0), new Score(100), new Date());
      }

      // series 2: also includes a score of 10.4
      session = session.recordShot(new ImpactPoint(0, 0), new Score(104), new Date());

      // first 10.4 score is in series 2
      expect(session.allShots[0]?.seriesNumber).toBe(2);
      expect(session.allShots[0]?.score.value).toBe(104);

      // 11th shot's 10.4 score is in series 3
      expect(session.allShots[10]?.seriesNumber).toBe(3);
      expect(session.allShots[10]?.score.value).toBe(104);

      // they have different seriesNumbers
      expect(session.allShots[0]?.seriesNumber).not.toBe(session.allShots[10]?.seriesNumber);
    });
  });
});
