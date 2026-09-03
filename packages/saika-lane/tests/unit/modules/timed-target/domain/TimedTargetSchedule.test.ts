import type { TimedTargetProgram } from '@sasakiuri/saika-rules';
import { describe, expect, it } from 'vitest';

import {
  buildTimedTargetSchedule,
  projectTimedTargetSchedule,
} from '@/main/modules/timed-target/domain/TimedTargetSchedule';

const duelProgram: TimedTargetProgram = {
  id: 'DUEL',
  label: 'Duel',
  purpose: 'MATCH',
  ruleReference: '6.4.13',
  loadPreparationSeconds: 60,
  attentionDelayMilliseconds: 7_000,
  attentionToleranceMilliseconds: 100,
  betweenExposuresMilliseconds: 7_000,
  minimumPauseAfterSeconds: 60,
  exposures: Array.from({ length: 5 }, () => ({
    nominalDurationMilliseconds: 3_000,
    signalExtensionMilliseconds: 100,
    recordingAfterTimeMilliseconds: 200,
    maximumShots: 1,
  })),
};

function schedule() {
  return buildTimedTargetSchedule({
    sequenceId: 'sequence',
    competitionId: 'competition',
    program: duelProgram,
    stageIndex: 2,
    seriesIndex: 0,
    targetProfileId: 'rapid',
    loadAt: new Date('2026-09-03T00:00:00.000Z'),
  });
}

describe('TimedTargetSchedule', () => {
  it('builds LOAD, ATTENTION, five green signals and separate after-time boundaries', () => {
    const result = schedule();

    expect(result.attentionAt.toISOString()).toBe('2026-09-03T00:01:00.000Z');
    expect(result.exposures[0]).toMatchObject({ index: 0, maximumShots: 1 });
    expect(result.exposures[0]?.greenAt.toISOString()).toBe('2026-09-03T00:01:07.000Z');
    expect(result.exposures[0]?.redAt.toISOString()).toBe('2026-09-03T00:01:10.100Z');
    expect(result.exposures[0]?.recordingClosesAt.toISOString()).toBe('2026-09-03T00:01:10.300Z');
    expect(result.exposures[1]?.greenAt.toISOString()).toBe('2026-09-03T00:01:17.100Z');
    expect(result.completesAt.toISOString()).toBe('2026-09-03T00:01:50.700Z');
    expect(result.nextLoadAllowedAt.toISOString()).toBe('2026-09-03T00:02:50.700Z');
  });

  it.each([
    ['2026-09-02T23:59:59.999Z', 'ARMED', 'RED', false],
    ['2026-09-03T00:00:00.000Z', 'LOAD', 'RED', false],
    ['2026-09-03T00:01:00.000Z', 'ATTENTION', 'RED', false],
    ['2026-09-03T00:01:07.000Z', 'FIRING', 'GREEN', true],
    ['2026-09-03T00:01:10.100Z', 'AFTER_TIME', 'RED', true],
    ['2026-09-03T00:01:10.300Z', 'BETWEEN_EXPOSURES', 'RED', false],
    ['2026-09-03T00:01:50.700Z', 'COMPLETE', 'RED', false],
  ] as const)('projects %s as %s', (at, phase, signal, shotWindowOpen) => {
    expect(projectTimedTargetSchedule(schedule(), new Date(at))).toMatchObject({ phase, signal, shotWindowOpen });
  });
});
