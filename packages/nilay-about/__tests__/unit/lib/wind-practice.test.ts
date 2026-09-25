import { describe, expect, it } from 'vitest';

import {
  attemptsByHour,
  createQuestion,
  fullValueDriftRadians,
  holdAnswer,
  holdSide,
  judgeAnswer,
  weakestHours,
  windValue,
} from '@/lib/wind-practice';

const load = { muzzleSpeed: { value: 800, unit: 'mps' }, ballisticCoefficient: 0.462, dragModel: 'g1' } as const;
const range = { maxSpeed: 8, minDistance: 100, maxDistance: 300, distanceStep: 50 };

describe('wind value', () => {
  it('is the sine of the angle to the line of fire', () => {
    expect(windValue(3)).toBe(1);
    expect(windValue(9)).toBe(1);
    expect(windValue(12)).toBe(0);
    expect(windValue(6)).toBe(0);
    // 1, 5, 7 and 11 o'clock are 30° off the line of fire: half value.
    expect(windValue(1)).toBeCloseTo(0.5, 12);
    expect(windValue(11)).toBeCloseTo(0.5, 12);
    // 2, 4, 8 and 10 o'clock are 60° off it.
    expect(windValue(2)).toBeCloseTo(Math.sqrt(3) / 2, 12);
  });

  it('holds into the wind', () => {
    expect(holdSide(3)).toBe('right');
    expect(holdSide(8)).toBe('left');
    expect(holdSide(12)).toBeNull();
  });
});

describe('hold questions', () => {
  it('multiplies the full value drift by the speed and the wind value', () => {
    const drift = fullValueDriftRadians(load, 300)!;
    const answer = holdAnswer({ kind: 'hold', hour: 1, speed: 4, distance: 300 }, load, {
      distance: 'm',
      wind: 'mps',
      angle: 'mil',
    })!;
    expect(answer.size).toBeCloseTo((drift * 4 * 0.5) / 0.001, 9);
    expect(answer.side).toBe('right');
  });

  it('matches a published drift table, scaled to one m/s', () => {
    // Federal Gold Medal Sierra MatchKing 308 Win 168 gr (GM308M): 2650 fps, G1 0.462, drift
    // 7.4 inches at 300 yd in a 10 mph full value wind (federalpremium.com, retrieved 2026-09-22;
    // the same table the trajectory tests check). A 10 mph wind is 4.4704 m/s.
    const federal = {
      muzzleSpeed: { value: 2650, unit: 'fps' },
      ballisticCoefficient: 0.462,
      dragModel: 'g1',
    } as const;
    const drift = fullValueDriftRadians(federal, 300 * 0.9144)!;
    const publishedPerMs = Math.atan((7.4 * 0.0254) / (300 * 0.9144)) / 4.4704;
    expect(Math.abs(drift - publishedPerMs) / publishedPerMs).toBeLessThan(0.04);
  });

  it('draws questions from the random source it is given', () => {
    const fixed = (value: number) => () => value;
    expect(createQuestion('value', range, fixed(0))).toEqual({ kind: 'value', hour: 1 });
    expect(createQuestion('hold', range, fixed(0.999))).toEqual({ kind: 'hold', hour: 12, speed: 8, distance: 300 });
    expect(createQuestion('hold', { ...range, maxSpeed: 0 }, fixed(0.5))).toBeNull();
  });

  it('finds the hours that go wrong most', () => {
    const attempts = [
      { kind: 'value', hour: 1, correct: false },
      { kind: 'value', hour: 1, correct: false },
      { kind: 'value', hour: 2, correct: true },
      { kind: 'value', hour: 2, correct: false },
      { kind: 'hold', hour: 3, correct: true },
    ] as const;
    expect(attemptsByHour(attempts)[1]).toEqual({ attempts: 2, correct: 0 });
    expect(weakestHours(attempts)).toEqual([1, 2]);
  });
});

describe('judging an answer', () => {
  it('counts a hold within the tolerance on the right side', () => {
    expect(judgeAnswer({ size: 0.5, side: 'right' }, { size: 0.55, side: 'right' }, 0.1)).toBe(true);
    expect(judgeAnswer({ size: 0.5, side: 'right' }, { size: 0.55, side: 'left' }, 0.1)).toBe(false);
    expect(judgeAnswer({ size: 0.5, side: 'right' }, { size: 0.7, side: 'right' }, 0.1)).toBe(false);
    // A hold smaller than the tolerance has no side worth judging.
    expect(judgeAnswer({ size: 0.05, side: 'left' }, { size: 0, side: null }, 0.1)).toBe(true);
    expect(judgeAnswer({ size: 50, side: null }, { size: 45, side: null }, 10)).toBe(true);
    expect(judgeAnswer({ size: 50, side: null }, { size: NaN, side: null }, 10)).toBe(false);
  });
});
