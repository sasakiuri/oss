import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { eventsContract } from '@/shared/ipc/contracts';

const phaseSchema = z.enum([
  'IDLE',
  'ACTIVE',
  'SHOT_COMPLETE',
  'SERIES_COMPLETE',
  'STAGE_ENTERED',
  'SHOOTOFF',
  'FINISHED',
]);

describe('events.contract phaseSchema', () => {
  it('accepts SHOT_COMPLETE', () => {
    const result = phaseSchema.safeParse('SHOT_COMPLETE');
    expect(result.success).toBe(true);
  });

  it('accepts all valid phases', () => {
    const phases = ['IDLE', 'ACTIVE', 'SHOT_COMPLETE', 'SERIES_COMPLETE', 'STAGE_ENTERED', 'SHOOTOFF', 'FINISHED'];
    for (const phase of phases) {
      const result = phaseSchema.safeParse(phase);
      expect(result.success).toBe(true);
    }
  });

  it('rejects an invalid phase', () => {
    const result = phaseSchema.safeParse('INVALID_PHASE');
    expect(result.success).toBe(false);
  });
});

describe('events.contract laneControlPatched', () => {
  it('preserves matchShots in a lane-control patch', () => {
    const parsed = eventsContract.events.laneControlPatched.schema.parse({
      laneId: 'lane-1',
      seq: 1,
      patch: { matchShots: [10.5, 10] },
    });

    expect(parsed.patch.matchShots).toEqual([10.5, 10]);
  });
});
