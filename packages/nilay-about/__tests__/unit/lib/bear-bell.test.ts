import { describe, expect, it } from 'vitest';

import {
  BEAR_SOURCES,
  BELL_LIMITS,
  BELL_TONES,
  ENCOUNTER_STAGES,
  PRE_TRIP_CHECKLIST,
  SPRAY_POINTS,
  STEP_MIN_GAP_MS,
  autoOffAt,
  bellPartials,
  createStepDetector,
  nextRingDelayMs,
  ringLevel,
  ringSeconds,
} from '@/lib/bear-bell';
import { bearBellSettingsSchema } from '@/lib/schemas/bear-bell';

describe('the bell sound', () => {
  it('gives every tone audible partials that die away within a few seconds', () => {
    for (const tone of BELL_TONES) {
      const partials = bellPartials(tone);
      expect(partials.length).toBeGreaterThan(0);
      for (const partial of partials) {
        expect(partial.frequencyHz).toBeGreaterThan(200);
        expect(partial.frequencyHz).toBeLessThan(17_000);
        expect(partial.gain).toBeGreaterThan(0);
      }
      expect(ringSeconds(partials)).toBeLessThan(5);
    }
  });

  it('strikes the second bell of the pair after the first', () => {
    const offsets = new Set(bellPartials('pair').map((partial) => partial.offsetSeconds));
    expect([...offsets].sort()).toEqual([0, 0.12]);
  });
});

describe('when it rings', () => {
  it('waits the interval, or half to one and a half times it when varied', () => {
    expect(nextRingDelayMs({ intervalSeconds: 3, vary: false }, 0.9)).toBe(3000);
    expect(nextRingDelayMs({ intervalSeconds: 4, vary: true }, 0)).toBe(2000);
    expect(nextRingDelayMs({ intervalSeconds: 4, vary: true }, 0.999)).toBe(5996);
  });

  it('rings at the chosen volume, or 60 to 100 % of it when varied', () => {
    expect(ringLevel(80, false, 0)).toBe(0.8);
    expect(ringLevel(80, true, 0)).toBeCloseTo(0.48, 10);
    expect(ringLevel(80, true, 1)).toBeCloseTo(0.8, 10);
    expect(ringLevel(150, false, 0)).toBe(1);
  });

  it('stops after the minutes chosen, and never with zero', () => {
    expect(autoOffAt(1_000, 30)).toBe(1_000 + 30 * 60_000);
    expect(autoOffAt(1_000, 0)).toBeNull();
  });
});

describe('ringing with each step', () => {
  const g = 9.8;
  const walk = (sensitivity: 1 | 3 | 5, peak: number, steps: number, gapMs: number) => {
    const detector = createStepDetector(sensitivity);
    let found = 0;
    let time = 0;
    // Settle on gravity, then a spike for each step with quiet samples between.
    for (let index = 0; index < 60; index += 1) detector.push({ x: 0, y: 0, z: g, timeMs: (time += 16) });
    for (let step = 0; step < steps; step += 1) {
      if (detector.push({ x: 0, y: 0, z: g + peak, timeMs: (time += 16) })) found += 1;
      for (let quiet = 0; quiet < Math.round(gapMs / 16); quiet += 1)
        detector.push({ x: 0, y: 0, z: g, timeMs: (time += 16) });
    }
    return found;
  };

  it('counts each rise above the threshold as one step', () => {
    expect(walk(3, 4, 10, 500)).toBe(10);
  });

  it('ignores movement smaller than the threshold for the sensitivity', () => {
    expect(walk(1, 2, 10, 500)).toBe(0);
    expect(walk(5, 2, 10, 500)).toBe(10);
  });

  it('does not count two steps closer together than a person can walk', () => {
    expect(walk(3, 4, 10, STEP_MIN_GAP_MS / 3)).toBeLessThan(10);
  });

  it('does not count a phone lying still, whichever way up', () => {
    const detector = createStepDetector(5);
    let found = 0;
    for (let index = 0; index < 600; index += 1)
      if (detector.push({ x: g * 0.6, y: g * 0.8, z: 0, timeMs: index * 16 })) found += 1;
    expect(found).toBe(0);
  });
});

describe('the sourced text', () => {
  it('cites a known source for every item, with the words and where they are', () => {
    const items = [
      ...PRE_TRIP_CHECKLIST,
      ...BELL_LIMITS,
      ...SPRAY_POINTS,
      ...ENCOUNTER_STAGES.flatMap((stage) => stage.quotes),
    ];
    for (const item of items) {
      expect(BEAR_SOURCES[item.source]).toBeDefined();
      expect(item.quote.length).toBeGreaterThan(5);
      expect(item.where).not.toBe('');
    }
    for (const source of Object.values(BEAR_SOURCES)) expect(source.url).toMatch(/^https:\/\//);
  });

  it('gives the checklist unique ids that the saved settings accept', () => {
    const ids = PRE_TRIP_CHECKLIST.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    const settings = {
      tone: 'bright',
      volumePercent: 80,
      mode: 'interval',
      intervalSeconds: 3,
      varyInterval: false,
      varyVolume: false,
      sensitivity: 3,
      autoOffMinutes: 0,
      keepScreenOn: true,
      checked: ids,
    };
    expect(bearBellSettingsSchema.safeParse(settings).success).toBe(true);
    expect(bearBellSettingsSchema.safeParse({ ...settings, checked: ['unknown'] }).success).toBe(false);
  });
});
