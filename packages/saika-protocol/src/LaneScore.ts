// SPDX-License-Identifier: MIT
import { z } from 'zod';

const HitMissResultProjectionSchema = z.object({
  type: z.literal('HIT_MISS'),
  source: z.literal('EFFECTIVE_SCORE_X10'),
  hitThresholdX10: z.number().int().min(0).max(109),
  hitValueX10: z.literal(10),
  missValueX10: z.literal(0),
  displayUnit: z.literal('HITS'),
  preserveSourceScore: z.literal(true),
  ruleReference: z.string().min(1),
});

const SeriesScoreSchema = z.object({
  seriesIndex: z.number().int().min(0),
  shots: z.array(z.number().int().min(0).max(109)),
  seriesTotalX10: z.number().int().min(0),
  isComplete: z.boolean(),
  sourceShotsX10: z.array(z.number().int().min(0).max(109)).optional(),
  sourceSeriesTotalX10: z.number().int().min(0).optional(),
});

export const LaneScorePayloadSchema = z
  .object({
    competitionId: z.string().uuid(),
    laneId: z.string().uuid(),
    sessionId: z.string().uuid(),
    totalScoreX10: z.number().int().min(0),
    totalShotCount: z.number().int().min(0),
    acc: z.enum(['RING', 'DECIMAL']),
    resultProjection: HitMissResultProjectionSchema.optional(),
    sourceTotalScoreX10: z.number().int().min(0).optional(),
    stages: z.array(
      z.object({
        stageIndex: z.number().int().min(0),
        stageName: z.string(),
        stageTotalX10: z.number().int().min(0),
        sourceStageTotalX10: z.number().int().min(0).optional(),
        series: z.array(SeriesScoreSchema),
      }),
    ),
    finalSnapshotCommandId: z.string().uuid().optional(),
    publishedAt: z.string().datetime(),
  })
  .superRefine((score, context) => {
    const stageIndices = new Set<number>();
    let declaredTotalX10 = 0;
    let declaredSourceTotalX10 = 0;
    let recordedShotCount = 0;

    score.stages.forEach((stage, stagePosition) => {
      if (stageIndices.has(stage.stageIndex)) {
        context.addIssue({
          code: 'custom',
          path: ['stages', stagePosition, 'stageIndex'],
          message: `Duplicate stageIndex ${stage.stageIndex}`,
        });
      }
      stageIndices.add(stage.stageIndex);

      const seriesIndices = new Set<number>();
      let declaredStageTotalX10 = 0;
      let declaredSourceStageTotalX10 = 0;
      stage.series.forEach((series, seriesPosition) => {
        if (seriesIndices.has(series.seriesIndex)) {
          context.addIssue({
            code: 'custom',
            path: ['stages', stagePosition, 'series', seriesPosition, 'seriesIndex'],
            message: `Duplicate seriesIndex ${series.seriesIndex}`,
          });
        }
        seriesIndices.add(series.seriesIndex);

        const shotTotalX10 = series.shots.reduce((sum, shot) => sum + shot, 0);
        if (series.seriesTotalX10 !== shotTotalX10) {
          context.addIssue({
            code: 'custom',
            path: ['stages', stagePosition, 'series', seriesPosition, 'seriesTotalX10'],
            message: `seriesTotalX10 must equal the shot total ${shotTotalX10}`,
          });
        }
        if (score.acc === 'RING') {
          series.shots.forEach((shot, shotPosition) => {
            if (shot % 10 !== 0) {
              context.addIssue({
                code: 'custom',
                path: ['stages', stagePosition, 'series', seriesPosition, 'shots', shotPosition],
                message: 'RING shot scores must be whole points in x10 representation',
              });
            }
          });
        }

        if (score.resultProjection) {
          if (!series.sourceShotsX10 || series.sourceSeriesTotalX10 === undefined) {
            context.addIssue({
              code: 'custom',
              path: ['stages', stagePosition, 'series', seriesPosition],
              message: 'Projected score series must preserve its source shots and total',
            });
          } else {
            if (series.sourceShotsX10.length !== series.shots.length) {
              context.addIssue({
                code: 'custom',
                path: ['stages', stagePosition, 'series', seriesPosition, 'sourceShotsX10'],
                message: 'sourceShotsX10 must contain one value for every result shot',
              });
            }
            const sourceShotTotalX10 = series.sourceShotsX10.reduce((sum, shot) => sum + shot, 0);
            if (series.sourceSeriesTotalX10 !== sourceShotTotalX10) {
              context.addIssue({
                code: 'custom',
                path: ['stages', stagePosition, 'series', seriesPosition, 'sourceSeriesTotalX10'],
                message: `sourceSeriesTotalX10 must equal the source shot total ${sourceShotTotalX10}`,
              });
            }
            series.shots.forEach((shot, shotPosition) => {
              const sourceShot = series.sourceShotsX10?.[shotPosition];
              if (sourceShot === undefined) return;
              const expected =
                sourceShot >= score.resultProjection!.hitThresholdX10
                  ? score.resultProjection!.hitValueX10
                  : score.resultProjection!.missValueX10;
              if (shot !== expected) {
                context.addIssue({
                  code: 'custom',
                  path: ['stages', stagePosition, 'series', seriesPosition, 'shots', shotPosition],
                  message: `Projected shot must equal ${expected} for source score ${sourceShot}`,
                });
              }
            });
            declaredSourceStageTotalX10 += series.sourceSeriesTotalX10;
          }
        }

        recordedShotCount += series.shots.length;
        declaredStageTotalX10 += series.seriesTotalX10;
      });

      if (stage.stageTotalX10 !== declaredStageTotalX10) {
        context.addIssue({
          code: 'custom',
          path: ['stages', stagePosition, 'stageTotalX10'],
          message: `stageTotalX10 must equal the series total ${declaredStageTotalX10}`,
        });
      }
      if (score.resultProjection && stage.sourceStageTotalX10 !== declaredSourceStageTotalX10) {
        context.addIssue({
          code: 'custom',
          path: ['stages', stagePosition, 'sourceStageTotalX10'],
          message: `sourceStageTotalX10 must equal the source series total ${declaredSourceStageTotalX10}`,
        });
      }
      declaredTotalX10 += stage.stageTotalX10;
      declaredSourceTotalX10 += declaredSourceStageTotalX10;
    });

    if (score.totalScoreX10 !== declaredTotalX10) {
      context.addIssue({
        code: 'custom',
        path: ['totalScoreX10'],
        message: `totalScoreX10 must equal the stage total ${declaredTotalX10}`,
      });
    }
    if (score.totalShotCount !== recordedShotCount) {
      context.addIssue({
        code: 'custom',
        path: ['totalShotCount'],
        message: `totalShotCount must equal the recorded shot count ${recordedShotCount}`,
      });
    }
    if (score.resultProjection) {
      if (score.acc !== 'DECIMAL') {
        context.addIssue({
          code: 'custom',
          path: ['acc'],
          message: 'HIT_MISS result projection requires DECIMAL source scoring',
        });
      }
      if (score.sourceTotalScoreX10 !== declaredSourceTotalX10) {
        context.addIssue({
          code: 'custom',
          path: ['sourceTotalScoreX10'],
          message: `sourceTotalScoreX10 must equal the source stage total ${declaredSourceTotalX10}`,
        });
      }
    }
  });

export type LaneScorePayload = z.infer<typeof LaneScorePayloadSchema>;
