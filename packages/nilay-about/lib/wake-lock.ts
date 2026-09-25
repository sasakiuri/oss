/**
 * Keeping the screen on while a timer runs, where the browser allows it.
 *
 * The Screen Wake Lock API is not in every browser, and a browser that has it can still refuse
 * (low battery, a page in the background). Either way the timer keeps running; the caller is told
 * whether the lock is held so the screen can say the display may turn off.
 */

interface WakeLockSentinelLike {
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
}

export type WakeLockResult = { held: true; release: () => void } | { held: false; reason: 'unsupported' | 'refused' };

export async function requestWakeLock(onLost: () => void): Promise<WakeLockResult> {
  const wakeLock = (
    navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } }
  ).wakeLock;
  if (!wakeLock) return { held: false, reason: 'unsupported' };
  try {
    const sentinel = await wakeLock.request('screen');
    sentinel.addEventListener('release', onLost);
    return {
      held: true,
      release: () => {
        void sentinel.release().catch(() => undefined);
      },
    };
  } catch {
    return { held: false, reason: 'refused' };
  }
}
