import { describe, expect, it } from 'vitest';

import {
  ShotDetector,
  blockPeaks,
  detectInRecording,
  fromDbfs,
  loudestOf,
  randomDelay,
  timeShots,
  toDbfs,
} from '@/lib/shot-timer';

/** Silence with a burst of decaying noise at each of the given seconds. */
function recording(sampleRate: number, seconds: number, bursts: readonly number[], level = 0.9): Float32Array {
  const samples = new Float32Array(Math.round(sampleRate * seconds));
  for (let index = 0; index < samples.length; index++) samples[index] = (Math.sin(index * 12.9898) % 1) * 0.005;
  for (const at of bursts) {
    const start = Math.round(at * sampleRate);
    for (let offset = 0; offset < sampleRate * 0.03; offset++) {
      const decay = Math.exp(-offset / (sampleRate * 0.005));
      samples[start + offset] = (offset % 2 === 0 ? 1 : -1) * level * decay;
    }
  }
  return samples;
}

describe('levels', () => {
  it('converts between peaks and dBFS', () => {
    expect(toDbfs(1)).toBe(0);
    expect(toDbfs(0.5)).toBeCloseTo(-6.02, 2);
    expect(fromDbfs(-20)).toBeCloseTo(0.1, 10);
    expect(toDbfs(0)).toBe(-Infinity);
  });
});

describe('the detector', () => {
  it('counts a loud block once and ignores its tail for the dead time', () => {
    const detector = new ShotDetector({ thresholdDb: -12, deadTimeMs: 80 });
    expect(detector.push(1.0, 0.9)).toBe(1.0);
    expect(detector.push(1.05, 0.9)).toBeNull();
    expect(detector.push(1.2, 0.1)).toBeNull();
    expect(detector.push(1.25, 0.5)).toBe(1.25);
    expect(detector.shots).toEqual([1.0, 1.25]);
  });

  it('stays deaf during the timer’s own beeps', () => {
    const detector = new ShotDetector({ thresholdDb: -20, deadTimeMs: 50 }, [{ start: 0, end: 0.4 }]);
    expect(detector.push(0.3, 1)).toBeNull();
    expect(detector.push(0.6, 1)).toBe(0.6);
  });
});

describe('a recording', () => {
  it('finds each burst to the millisecond and times it from the start signal', () => {
    const rate = 48000;
    const samples = recording(rate, 3, [0.5, 1.72, 1.98, 2.31]);
    const found = detectInRecording(samples, rate, { thresholdDb: -12, deadTimeMs: 80 });
    expect(found.map((time) => Math.round(time * 1000))).toEqual([500, 1720, 1980, 2310]);
    const timed = timeShots(found[0]!, found.slice(1));
    expect(timed.map((shot) => Number(shot.time.toFixed(2)))).toEqual([1.22, 1.48, 1.81]);
    expect(timed.map((shot) => Number(shot.split.toFixed(2)))).toEqual([1.22, 0.26, 0.33]);
  });

  it('misses a burst below the threshold, which is the reader’s to lower', () => {
    const samples = recording(48000, 1, [0.5], 0.1);
    expect(detectInRecording(samples, 48000, { thresholdDb: -12, deadTimeMs: 80 })).toEqual([]);
    expect(detectInRecording(samples, 48000, { thresholdDb: -24, deadTimeMs: 80 })).toHaveLength(1);
  });

  it('keeps the loudest channel and blocks a millisecond at a time', () => {
    expect(Array.from(loudestOf([new Float32Array([0.1, -0.8]), new Float32Array([-0.5, 0.2])]))).toEqual([
      expect.closeTo(0.5, 6),
      expect.closeTo(0.8, 6),
    ]);
    expect(blockPeaks(new Float32Array(100), 48000)).toHaveLength(3);
  });
});

describe('the start delay', () => {
  it('falls between the two bounds in either order', () => {
    expect(randomDelay(2, 4, () => 0)).toBe(2);
    expect(randomDelay(4, 2, () => 1)).toBe(4);
    expect(randomDelay(2, 4, () => 0.5)).toBe(3);
  });
});
