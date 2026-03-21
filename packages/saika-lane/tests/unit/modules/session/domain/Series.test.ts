// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { Score } from '@/main/modules/session/domain/Score';
import { Series } from '@/main/modules/session/domain/Series';

describe('Series value object', () => {
  describe('creating an empty series', () => {
    it('Series.create() creates an empty series', () => {
      const series = Series.create(1);
      expect(series.seriesNumber).toBe(1);
      expect(series.count).toBe(0);
      expect(series.isComplete).toBe(false);
    });

    it('series number is an integer of 1 or greater', () => {
      const series = Series.create(5);
      expect(series.seriesNumber).toBe(5);
    });

    it('throws an error when series number is 0 or negative', () => {
      expect(() => Series.create(0)).toThrow();
      expect(() => Series.create(-1)).toThrow();
    });

    it('throws an error when series number is a decimal', () => {
      expect(() => Series.create(1.5)).toThrow();
    });
  });

  describe('adding scores', () => {
    it('addScore() adds a new score', () => {
      const series = Series.create(1);
      const score = new Score(105);
      const newSeries = series.addScore(score);

      expect(newSeries.count).toBe(1);
      expect(newSeries.scores[0]).toBe(score);
    });

    it('addScore() does not mutate the original instance, returns a new instance (immutability)', () => {
      const series = Series.create(1);
      const score = new Score(105);
      const newSeries = series.addScore(score);

      expect(series.count).toBe(0);
      expect(newSeries.count).toBe(1);
      expect(series).not.toBe(newSeries);
    });

    it('can add multiple scores consecutively', () => {
      const series = Series.create(1);
      const score1 = new Score(105);
      const score2 = new Score(98);
      const score3 = new Score(102);

      const newSeries = series.addScore(score1).addScore(score2).addScore(score3);

      expect(newSeries.count).toBe(3);
      expect(newSeries.scores[0]).toBe(score1);
      expect(newSeries.scores[1]).toBe(score2);
      expect(newSeries.scores[2]).toBe(score3);
    });

    it('isComplete becomes true after adding 10 shots', () => {
      let series = Series.create(1);
      for (let i = 0; i < 10; i++) {
        series = series.addScore(new Score(100));
      }
      expect(series.isComplete).toBe(true);
      expect(series.count).toBe(10);
    });

    it('throws an error when attempting to add an 11th shot', () => {
      let series = Series.create(1);
      for (let i = 0; i < 10; i++) {
        series = series.addScore(new Score(100));
      }
      expect(() => series.addScore(new Score(100))).toThrow();
    });
  });

  describe('total score calculation', () => {
    it('total score of an empty series is 0.0', () => {
      const series = Series.create(1);
      expect(series.total).toBe(0);
    });

    it('calculates the total score for 1 shot', () => {
      const series = Series.create(1).addScore(new Score(105));
      expect(series.total).toBe(105);
    });

    it('calculates the total score for multiple shots', () => {
      const series = Series.create(1).addScore(new Score(105)).addScore(new Score(98)).addScore(new Score(102));

      expect(series.total).toBe(305);
    });

    it('calculates the total score for 10 shots', () => {
      let series = Series.create(1);
      for (let i = 0; i < 10; i++) {
        series = series.addScore(new Score(100));
      }
      expect(series.total).toBe(1000);
    });

    it('calculates total score including a miss (0.0)', () => {
      const series = Series.create(1).addScore(new Score(105)).addScore(Score.miss()).addScore(new Score(95));

      expect(series.total).toBe(200);
    });
  });

  describe('average score calculation', () => {
    it('average score of an empty series is 0.0', () => {
      const series = Series.create(1);
      expect(series.average).toBe(0);
    });

    it('calculates the average score for 1 shot', () => {
      const series = Series.create(1).addScore(new Score(105));
      expect(series.average).toBe(105);
    });

    it('calculates the average score for multiple shots (to 1 decimal place)', () => {
      const series = Series.create(1).addScore(new Score(105)).addScore(new Score(98)).addScore(new Score(102));

      // (10.5 + 9.8 + 10.2) / 3 = 10.166... → 10.2
      expect(series.average).toBe(102);
    });

    it('calculates the average score for 10 shots', () => {
      let series = Series.create(1);
      for (let i = 0; i < 10; i++) {
        series = series.addScore(new Score(100));
      }
      expect(series.average).toBe(100);
    });

    it('calculates average score including a miss', () => {
      const series = Series.create(1).addScore(new Score(100)).addScore(Score.miss()).addScore(new Score(80));

      // (10.0 + 0.0 + 8.0) / 3 = 6.0
      expect(series.average).toBe(60);
    });
  });

  describe('equals() method', () => {
    it('returns true for Series with the same series number and same scores', () => {
      const series1 = Series.create(1).addScore(new Score(105));
      const series2 = Series.create(1).addScore(new Score(105));
      expect(series1.equals(series2)).toBe(true);
    });

    it('returns false for Series with different series numbers', () => {
      const series1 = Series.create(1).addScore(new Score(105));
      const series2 = Series.create(2).addScore(new Score(105));
      expect(series1.equals(series2)).toBe(false);
    });

    it('returns false for Series with the same series number but different scores', () => {
      const series1 = Series.create(1).addScore(new Score(105));
      const series2 = Series.create(1).addScore(new Score(95));
      expect(series1.equals(series2)).toBe(false);
    });

    it('returns true for empty Series', () => {
      const series1 = Series.create(1);
      const series2 = Series.create(1);
      expect(series1.equals(series2)).toBe(true);
    });

    it('returns false when score counts differ', () => {
      const series1 = Series.create(1).addScore(new Score(105));
      const series2 = Series.create(1);
      expect(series1.equals(series2)).toBe(false);
    });

    it('returns false when same score count but different order', () => {
      const series1 = Series.create(1).addScore(new Score(105)).addScore(new Score(95));
      const series2 = Series.create(1).addScore(new Score(95)).addScore(new Score(105));
      expect(series1.equals(series2)).toBe(false);
    });
  });

  describe('immutability', () => {
    it('seriesNumber property is read-only', () => {
      const series = Series.create(1);
      expect(() => {
        (series as any).seriesNumber = 2;
      }).toThrow();
    });

    it('scores property is read-only', () => {
      const series = Series.create(1).addScore(new Score(105));
      expect(() => {
        (series as any).scores = [];
      }).toThrow();
    });

    it('direct push to scores array fails', () => {
      const series = Series.create(1).addScore(new Score(105));
      expect(() => {
        (series.scores as Score[]).push(new Score(90));
      }).toThrow();
    });

    it('modifying a copy of the scores array does not affect the original Series', () => {
      const series = Series.create(1).addScore(new Score(105));
      const scores = [...series.scores]; // copy
      scores.push(new Score(90));

      expect(series.count).toBe(1);
    });
  });

  describe('boundary value tests', () => {
    it('accepts the minimum series number (1)', () => {
      const series = Series.create(1);
      expect(series.seriesNumber).toBe(1);
    });

    it('accepts a large series number (100)', () => {
      const series = Series.create(100);
      expect(series.seriesNumber).toBe(100);
    });

    it('accepts a state with 0 scores', () => {
      const series = Series.create(1);
      expect(series.count).toBe(0);
      expect(series.isComplete).toBe(false);
    });

    it('accepts a state with 10 scores (complete state)', () => {
      let series = Series.create(1);
      for (let i = 0; i < 10; i++) {
        series = series.addScore(new Score(100));
      }
      expect(series.count).toBe(10);
      expect(series.isComplete).toBe(true);
    });
  });

  describe('maxShots parameter', () => {
    it('default maxShots is 10', () => {
      const series = Series.create(1);
      expect(series.maxShots).toBe(10);
    });

    it('can specify a custom maxShots', () => {
      const series = Series.create(1, 5);
      expect(series.maxShots).toBe(5);
    });

    it('maxShots=0 represents unlimited', () => {
      const series = Series.create(1, 0);
      expect(series.maxShots).toBe(0);
    });

    it('isComplete=true after adding 5 shots to a Series with maxShots=5', () => {
      let series = Series.create(1, 5);
      for (let i = 0; i < 5; i++) {
        series = series.addScore(new Score(100));
      }
      expect(series.isComplete).toBe(true);
      expect(series.count).toBe(5);
    });

    it('6th shot throws an error in a Series with maxShots=5', () => {
      let series = Series.create(1, 5);
      for (let i = 0; i < 5; i++) {
        series = series.addScore(new Score(100));
      }
      expect(() => series.addScore(new Score(100))).toThrow();
    });

    it('isComplete=false after 10 shots in a Series with maxShots=0 (unlimited)', () => {
      let series = Series.create(1, 0);
      for (let i = 0; i < 10; i++) {
        series = series.addScore(new Score(100));
      }
      expect(series.isComplete).toBe(false);
      expect(series.count).toBe(10);
    });

    it('any number of shots can be added to a Series with maxShots=0 (unlimited)', () => {
      let series = Series.create(1, 0);
      for (let i = 0; i < 20; i++) {
        series = series.addScore(new Score(100));
      }
      expect(series.count).toBe(20);
      expect(series.isComplete).toBe(false);
    });

    it('maxShots is preserved after addScore', () => {
      const series = Series.create(1, 5);
      const updated = series.addScore(new Score(100));
      expect(updated.maxShots).toBe(5);
    });
  });

  describe('edge cases', () => {
    it('total score of a series with all misses (0.0) is 0.0', () => {
      let series = Series.create(1);
      for (let i = 0; i < 10; i++) {
        series = series.addScore(Score.miss());
      }
      expect(series.total).toBe(0);
      expect(series.average).toBe(0);
    });

    it('total score of a series with all perfect scores (10.9) is 109.0', () => {
      let series = Series.create(1);
      for (let i = 0; i < 10; i++) {
        series = series.addScore(new Score(109));
      }
      expect(series.total).toBe(1090);
      expect(series.average).toBe(109);
    });

    it('handles floating-point precision correctly', () => {
      const series = Series.create(1).addScore(new Score(101)).addScore(new Score(102)).addScore(new Score(103));

      // 10.1 + 10.2 + 10.3 = 30.6
      expect(series.total).toBe(306);
    });
  });
});
