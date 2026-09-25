import { bellPartials, ringSeconds, type BellTone } from '@/lib/bear-bell';

type AudioContextConstructor = typeof AudioContext;

const audioContextConstructor = (): AudioContextConstructor | null => {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
};

/** Whether this browser can make the sound at all. */
export function canPlayBell(): boolean {
  return audioContextConstructor() !== null;
}

/**
 * Plays the bell through Web Audio. The context is made and resumed inside the press that starts
 * the bell, since browsers only let a page start sound from a user action. A browser may suspend or
 * interrupt the context when the page is hidden or the screen is locked; `state` reports that.
 */
export class BellPlayer {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private listener: (() => void) | null = null;

  /** Call from the press itself. Resolves once the context is running, or rejects if it cannot. */
  unlock(): Promise<void> {
    if (!this.context) {
      const Constructor = audioContextConstructor();
      if (!Constructor) return Promise.reject(new Error('Web Audio is not available'));
      const context = new Constructor();
      // A compressor keeps two bells struck together from clipping at full volume.
      const compressor = context.createDynamicsCompressor();
      const output = context.createGain();
      output.gain.value = 0.35;
      output.connect(compressor);
      compressor.connect(context.destination);
      context.onstatechange = () => this.listener?.();
      this.context = context;
      this.output = output;
    }
    return this.context.resume();
  }

  /** 'running' while sound can be heard; anything else means the browser has stopped it. */
  get state(): string {
    return this.context?.state ?? 'closed';
  }

  onStateChange(listener: (() => void) | null): void {
    this.listener = listener;
  }

  /** One strike of the bell at `level` (0–1). Does nothing while the context is not running. */
  ring(tone: BellTone, level: number): void {
    const context = this.context;
    const output = this.output;
    if (!context || !output || context.state !== 'running' || level <= 0) return;
    const partials = bellPartials(tone);
    const loudest = partials.reduce((sum, partial) => sum + partial.gain, 0);
    const start = context.currentTime + 0.01;
    const end = start + ringSeconds(partials);
    for (const partial of partials) {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = partial.frequencyHz;
      const gain = context.createGain();
      const at = start + partial.offsetSeconds;
      const peak = (partial.gain / loudest) * level;
      gain.gain.setValueAtTime(0, at);
      // A few milliseconds of attack avoids a click; the rest is the bell dying away.
      gain.gain.linearRampToValueAtTime(peak, at + 0.004);
      gain.gain.setTargetAtTime(0, at + 0.004, partial.decaySeconds);
      oscillator.connect(gain);
      gain.connect(output);
      oscillator.start(at);
      oscillator.stop(end);
    }
  }

  /** Releases the audio hardware. */
  close(): void {
    this.listener = null;
    if (this.context) void this.context.close().catch(() => undefined);
    this.context = null;
    this.output = null;
  }
}

type DeviceMotionPermission = { requestPermission?: () => Promise<'granted' | 'denied'> };

/**
 * Asks for the motion sensor where the browser requires it (iOS Safari), from the press itself.
 * Resolves true when motion events may be received; other browsers need no permission.
 */
export function requestMotionPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof DeviceMotionEvent === 'undefined') return Promise.resolve(false);
  const request = (DeviceMotionEvent as unknown as DeviceMotionPermission).requestPermission;
  if (typeof request !== 'function') return Promise.resolve(true);
  return request.call(DeviceMotionEvent).then(
    (answer) => answer === 'granted',
    () => false,
  );
}
