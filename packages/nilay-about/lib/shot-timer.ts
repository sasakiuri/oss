/**
 * Finding shots in sound, for the shot timer's microphone and for the sound track of a video.
 *
 * A shot is a loud, short sound. The detector looks at the largest sample in each short block and
 * counts a shot when it reaches a threshold, then ignores the echo and the rest of the report for a
 * dead time. It does not know what made the sound: a clap, a dropped magazine or the next bay's shot
 * all count, which is why the threshold is the reader's to set and the list can be corrected.
 *
 * Nothing here touches the browser's audio APIs, so the arithmetic is checked against made-up signals.
 */

export interface DetectorSettings {
  /** The level a block's peak has to reach, in dB relative to full scale (0 dBFS is the loudest sample). */
  thresholdDb: number;
  /** After a shot, nothing is counted for this long: the echo and the tail of the same report. */
  deadTimeMs: number;
}

/** A stretch of time in which sound is not a shot, such as the timer's own beeps coming back through the microphone. */
export interface QuietWindow {
  start: number;
  end: number;
}

export const DEFAULT_DETECTOR: DetectorSettings = { thresholdDb: -12, deadTimeMs: 80 };

export function toDbfs(peak: number): number {
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

export function fromDbfs(db: number): number {
  return 10 ** (db / 20);
}

/**
 * Counts shots from block peaks as they arrive. Times are in seconds on whatever clock the caller
 * uses; the audio clock for the microphone, the position in the file for a video.
 */
export class ShotDetector {
  private readonly threshold: number;
  private readonly deadTime: number;
  private last = -Infinity;
  readonly shots: number[] = [];

  constructor(
    settings: DetectorSettings,
    private readonly quiet: readonly QuietWindow[] = [],
  ) {
    this.threshold = fromDbfs(settings.thresholdDb);
    this.deadTime = settings.deadTimeMs / 1000;
  }

  /** Feed one block. Returns the time of the shot it found, or null. */
  push(time: number, peak: number): number | null {
    if (!(peak >= this.threshold) || !Number.isFinite(time)) return null;
    if (time - this.last < this.deadTime) return null;
    if (this.quiet.some((window) => time >= window.start && time <= window.end)) return null;
    this.last = time;
    this.shots.push(time);
    return time;
  }
}

/** One millisecond blocks: fine enough for splits, which are read to a hundredth of a second. */
export const OFFLINE_BLOCK_SECONDS = 0.001;

/** The peak of each block of a recording, the same measure the microphone sends. */
export function blockPeaks(
  samples: Float32Array,
  sampleRate: number,
  blockSeconds = OFFLINE_BLOCK_SECONDS,
): Float32Array {
  const size = Math.max(1, Math.round(sampleRate * blockSeconds));
  const peaks = new Float32Array(Math.ceil(samples.length / size));
  for (let block = 0; block < peaks.length; block++) {
    let peak = 0;
    const end = Math.min(samples.length, (block + 1) * size);
    for (let index = block * size; index < end; index++) {
      const value = Math.abs(samples[index] ?? 0);
      if (value > peak) peak = value;
    }
    peaks[block] = peak;
  }
  return peaks;
}

/** Every loud event in a recording, as seconds from its start. */
export function detectInRecording(samples: Float32Array, sampleRate: number, settings: DetectorSettings): number[] {
  const size = Math.max(1, Math.round(sampleRate * OFFLINE_BLOCK_SECONDS));
  const detector = new ShotDetector(settings);
  blockPeaks(samples, sampleRate).forEach((peak, block) => detector.push((block * size) / sampleRate, peak));
  return detector.shots;
}

/** Several channels mixed to one by taking the loudest at each sample, so a shot on either side is kept. */
export function loudestOf(channels: readonly Float32Array[]): Float32Array {
  const length = Math.max(0, ...channels.map((channel) => channel.length));
  const mixed = new Float32Array(length);
  for (const channel of channels)
    for (let index = 0; index < channel.length; index++) {
      const value = Math.abs(channel[index] ?? 0);
      if (value > (mixed[index] ?? 0)) mixed[index] = value;
    }
  return mixed;
}

export interface TimedShot {
  /** Seconds from the start signal. */
  time: number;
  /** Seconds from the shot before, or from the start signal for the first. */
  split: number;
}

/** Shot times measured from the start signal, with the split to each. Shots before the signal are left out. */
export function timeShots(start: number, shots: readonly number[]): TimedShot[] {
  const after = shots.filter((time) => time > start).sort((a, b) => a - b);
  return after.map((time, index) => ({
    time: time - start,
    split: time - (index === 0 ? start : (after[index - 1] as number)),
  }));
}

/** A random start delay between the two bounds, as a range officer's "stand by" varies. */
export function randomDelay(minSeconds: number, maxSeconds: number, random: () => number = Math.random): number {
  const low = Math.min(minSeconds, maxSeconds);
  const high = Math.max(minSeconds, maxSeconds);
  return low + (high - low) * random();
}

/**
 * The AudioWorklet that reports the peak of each 128-sample render quantum with the audio clock's
 * time, so a shot is timed on the same clock the start beep was scheduled on. It is a string because a
 * worklet has to be loaded as a module from a URL; the page makes a blob URL of it and nothing is fetched.
 */
export const PEAK_WORKLET_SOURCE = `
class PeakProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channels = inputs[0];
    if (channels && channels.length > 0) {
      let peak = 0;
      for (const channel of channels)
        for (let index = 0; index < channel.length; index++) {
          const value = Math.abs(channel[index]);
          if (value > peak) peak = value;
        }
      this.port.postMessage({ time: currentTime, peak });
    }
    return true;
  }
}
registerProcessor('nilay-peak', PeakProcessor);
`;
