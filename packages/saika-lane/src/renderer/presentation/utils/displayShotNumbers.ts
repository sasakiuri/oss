// SPDX-License-Identifier: MIT
import type { ShotDto } from '@/shared/ipc/contracts';

/**
 * Converts persisted session-wide shot numbers into display shot numbers.
 *
 * The domain shotNumber is stable across the whole session. The lane screen,
 * however, shows the number within the current series, so it must restart when
 * seriesNumber changes.
 */
export function withDisplayShotNumbers<T extends Pick<ShotDto, 'mode' | 'seriesNumber' | 'shotNumber'>>(
  shots: readonly T[],
): T[] {
  const counters = new Map<string, number>();

  return shots.map((shot) => {
    if (typeof shot.seriesNumber !== 'number') {
      return shot;
    }

    const key = `${shot.mode}:${shot.seriesNumber}`;
    const nextShotNumber = (counters.get(key) ?? 0) + 1;
    counters.set(key, nextShotNumber);

    if (shot.shotNumber === nextShotNumber) {
      return shot;
    }

    return {
      ...shot,
      shotNumber: nextShotNumber,
    };
  });
}
