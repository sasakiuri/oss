// SPDX-License-Identifier: MIT
import type { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import type { IScoreDiscrepancyLogger } from '@/main/modules/session/domain/IScoreDiscrepancyLogger';
import { Score } from '@/main/modules/session/domain/Score';
import { getLogger } from '@/main/shared-infra/logging/createLogger';

export interface DiscrepancyContext {
  deviceScore: number;
  calculatedScore: Score;
  impactPoint: ImpactPoint;
  timestamp: Date;
  sessionId: string;
  discipline: string;
  mode: string;
}

/**
 * ScoreDiscrepancyDetector
 *
 * A domain service that detects discrepancies between device scores and
 * app-calculated scores, and records them in warning logs and a CSV file.
 */
export class ScoreDiscrepancyDetector {
  constructor(private readonly csvLogger: IScoreDiscrepancyLogger) {}

  /**
   * Compares device score and app-calculated score, and records any discrepancy.
   */
  detect(ctx: DiscrepancyContext): void {
    const deviceScoreObj = new Score(ctx.deviceScore);
    if (deviceScoreObj.equals(ctx.calculatedScore)) {
      return;
    }

    const distance = ctx.impactPoint.distanceFromCenter();
    getLogger().warn(
      `Score discrepancy detected: device=${deviceScoreObj.toString()}, app calculated=${ctx.calculatedScore.toString()}, distance=${distance.toFixed(3)}mm, coordinates=(${ctx.impactPoint.x.toFixed(3)}, ${ctx.impactPoint.y.toFixed(3)})`,
      'domain',
      {
        deviceScore: deviceScoreObj.value,
        calculatedScore: ctx.calculatedScore.value,
        distance,
        impactPoint: { x: ctx.impactPoint.x, y: ctx.impactPoint.y },
        sessionId: ctx.sessionId,
      },
    );

    try {
      this.csvLogger.log({
        timestamp: ctx.timestamp,
        sessionId: ctx.sessionId,
        discipline: ctx.discipline,
        mode: ctx.mode,
        deviceScore: deviceScoreObj.value,
        appScore: ctx.calculatedScore.value,
        diff: ctx.calculatedScore.value - deviceScoreObj.value,
        distance,
        x: ctx.impactPoint.x,
        y: ctx.impactPoint.y,
      });
    } catch (csvError) {
      getLogger().error(
        `Failed to write CSV discrepancy log: ${csvError instanceof Error ? csvError.message : String(csvError)}`,
        'domain',
      );
    }
  }
}
