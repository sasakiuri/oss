// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { LaneScorePayloadSchema, RawShotPayloadSchema } from '@/shared/mqtt/protocol';

const BASE_SCORE = {
  competitionId: '11111111-1111-4111-8111-111111111111',
  laneId: '22222222-2222-4222-8222-222222222222',
  sessionId: '33333333-3333-4333-8333-333333333333',
  totalScoreX10: 205,
  totalShotCount: 2,
  acc: 'DECIMAL' as const,
  stages: [
    {
      stageIndex: 1,
      stageName: 'Match',
      stageTotalX10: 205,
      series: [
        {
          seriesIndex: 0,
          shots: [105, 100],
          seriesTotalX10: 205,
          isComplete: false,
        },
      ],
    },
  ],
  publishedAt: '2026-08-28T00:00:00.000Z',
};

describe('LaneScorePayloadSchema', () => {
  it('accepts a score whose shot count and aggregate totals agree', () => {
    expect(LaneScorePayloadSchema.safeParse(BASE_SCORE).success).toBe(true);
  });

  it('rejects a total score that disagrees with its stages', () => {
    expect(LaneScorePayloadSchema.safeParse({ ...BASE_SCORE, totalScoreX10: 999 }).success).toBe(false);
  });

  it('rejects a series total that disagrees with its shots', () => {
    const score = structuredClone(BASE_SCORE);
    score.stages[0]!.series[0]!.seriesTotalX10 = 204;

    expect(LaneScorePayloadSchema.safeParse(score).success).toBe(false);
  });

  it('rejects a shot count that disagrees with its series', () => {
    expect(LaneScorePayloadSchema.safeParse({ ...BASE_SCORE, totalShotCount: 60 }).success).toBe(false);
  });

  it('rejects shot values outside the physical score range', () => {
    const score = structuredClone(BASE_SCORE);
    score.totalScoreX10 = 210;
    score.stages[0]!.stageTotalX10 = 210;
    score.stages[0]!.series[0]!.shots = [110, 100];
    score.stages[0]!.series[0]!.seriesTotalX10 = 210;

    expect(LaneScorePayloadSchema.safeParse(score).success).toBe(false);
  });

  it('rejects decimal shot values in RING scoring mode', () => {
    expect(LaneScorePayloadSchema.safeParse({ ...BASE_SCORE, acc: 'RING' }).success).toBe(false);
  });

  it('rejects duplicate stage and series indices', () => {
    const duplicateSeries = structuredClone(BASE_SCORE.stages[0]!.series[0]!);
    const duplicateStage = structuredClone(BASE_SCORE.stages[0]!);
    duplicateStage.series.push(duplicateSeries);
    duplicateStage.stageTotalX10 = 410;
    const score = {
      ...BASE_SCORE,
      stages: [duplicateStage, structuredClone(duplicateStage)],
      totalScoreX10: 820,
      totalShotCount: 8,
    };

    expect(LaneScorePayloadSchema.safeParse(score).success).toBe(false);
  });
});

describe('RawShotPayloadSchema', () => {
  const legacyPayload = {
    laneId: '11111111-1111-4111-8111-111111111111',
    shotId: '22222222-2222-4222-8222-222222222222',
    x: 1.2,
    y: -0.4,
    rawScoreX10: 101,
    innerTen: false,
    mode: 'MATCH' as const,
    timestamp: '2026-08-28T00:00:00.000Z',
  };

  it('keeps accepting the legacy effective-score alias', () => {
    expect(RawShotPayloadSchema.safeParse(legacyPayload).success).toBe(true);
  });

  it('accepts separately named device, calculated, and effective score evidence', () => {
    const parsed = RawShotPayloadSchema.safeParse({
      ...legacyPayload,
      deviceScoreX10: 99,
      calculatedScoreX10: 102,
      effectiveScoreX10: 101,
      observationId: '33333333-3333-4333-8333-333333333333',
      receivedAt: '2026-08-28T00:00:00.050Z',
    });

    expect(parsed.success).toBe(true);
  });
});
