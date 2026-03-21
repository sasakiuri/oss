// SPDX-License-Identifier: MIT
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Score } from '@/main/modules/session/domain/Score';
import { Shot } from '@/main/modules/session/domain/Shot';

import type { AdapterContext } from '../AdapterContext';

/**
 * MT201ShotFactory
 *
 * Responsible for creating Shot objects in the MT201 adapter.
 * Provides creation of normal shots and miss shots.
 */
export class MT201ShotFactory {
  /**
   * Creates a normal Shot.
   *
   * @param impactPoint - Impact point
   * @param score - Score
   * @param timestamp - Shot timestamp
   * @param context - Adapter context
   * @param innerTen - Whether the shot is in the X ring (inner ten)
   * @returns Shot entity
   */
  createShot(
    impactPoint: ImpactPoint,
    score: Score,
    timestamp: Date,
    context: AdapterContext,
    innerTen: boolean,
  ): Shot {
    return Shot.create({
      impactPoint,
      score,
      mode: context.mode,
      timestamp,
      shotNumber: context.shotNumber,
      seriesNumber: 0, // Shots created by adapter are unassigned to a series
      innerTen,
    });
  }

  /**
   * Creates a miss shot Shot object.
   *
   * impactPoint is null (to identify as a miss shot).
   *
   * @param timestamp - Shot timestamp
   * @param context - Adapter context
   * @returns Miss shot Shot entity
   */
  createMissShot(timestamp: Date, context: AdapterContext): Shot {
    // Score of 0 points
    const missScore = Score.miss();

    return Shot.create({
      impactPoint: null, // Miss shot: no coordinates
      score: missScore,
      mode: context.mode,
      timestamp,
      shotNumber: context.shotNumber,
      seriesNumber: 0,
      innerTen: false,
    });
  }
}
