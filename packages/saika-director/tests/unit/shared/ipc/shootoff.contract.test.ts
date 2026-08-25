import { describe, expect, it } from 'vitest';
import { shootoffContract } from '@/shared/ipc/contracts';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const SHOOTOFF_ID = '22222222-2222-4222-8222-222222222222';
const LANE_1_ID = '33333333-3333-4333-8333-333333333333';
const LANE_2_ID = '44444444-4444-4444-8444-444444444444';

describe('shootoff contract', () => {
  it('rejects duplicate target lanes when starting', () => {
    const result = shootoffContract.procedures.start.input.safeParse({
      eventId: EVENT_ID,
      targetLaneIds: [LANE_1_ID, LANE_1_ID],
      contestedRank: 3,
    });

    expect(result.success).toBe(false);
  });

  it('rejects duplicate lanes in a final ranking', () => {
    const result = shootoffContract.procedures.resolve.input.safeParse({
      shootoffId: SHOOTOFF_ID,
      rankedLaneIds: [LANE_2_ID, LANE_2_ID],
    });

    expect(result.success).toBe(false);
  });
});
