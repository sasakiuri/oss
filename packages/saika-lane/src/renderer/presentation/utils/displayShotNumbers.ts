// SPDX-License-Identifier: MIT
import type { ShotDto } from '@/shared/ipc/contracts';

/**
 * Display shot number conversion options.
 */
export interface DisplayShotNumberOptions {
  /**
   * Shot indices where the Preparation counter should be initialized before
   * numbering the shot at that index.
   */
  preparationResetIndices?: readonly number[];
}

/**
 * Converts persisted session-wide shot numbers into display shot numbers.
 *
 * The domain shotNumber is stable across the whole session. The lane screen
 * shows independent sequence numbers for Match and Preparation. Match keeps a
 * continuous sequence across series; Preparation is initialized when the
 * Preparation button is pressed.
 */
export function withDisplayShotNumbers<T extends Pick<ShotDto, 'mode' | 'shotNumber'>>(
  shots: readonly T[],
  options: DisplayShotNumberOptions = {},
): T[] {
  const preparationResetIndices = new Set(options.preparationResetIndices ?? []);
  let matchCounter = 0;
  let preparationCounter = 0;
  let previousMode: string | undefined;

  return shots.map((shot, index) => {
    let nextShotNumber: number;

    if (shot.mode === 'MATCH') {
      matchCounter += 1;
      nextShotNumber = matchCounter;
    } else {
      if (preparationResetIndices.has(index) || (previousMode !== undefined && previousMode !== shot.mode)) {
        preparationCounter = 0;
      }
      preparationCounter += 1;
      nextShotNumber = preparationCounter;
    }

    previousMode = shot.mode;

    if (shot.shotNumber === nextShotNumber) {
      return shot;
    }

    return {
      ...shot,
      shotNumber: nextShotNumber,
    };
  });
}
