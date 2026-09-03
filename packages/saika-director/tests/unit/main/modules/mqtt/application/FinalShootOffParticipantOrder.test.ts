import { describe, expect, it } from 'vitest';

import { orderFinalShootOffLaneIds } from '@/main/modules/mqtt/application/FinalShootOffParticipantOrder';

describe('orderFinalShootOffLaneIds', () => {
  it('preserves simultaneous participants and sorts sequential participants by Finals Start Number', () => {
    const laneIds = ['lane-c', 'lane-a', 'lane-b'];
    const starts = new Map([
      ['lane-a', 1],
      ['lane-b', 4],
      ['lane-c', 7],
    ]);

    expect(orderFinalShootOffLaneIds(laneIds, 'SIMULTANEOUS', undefined, (laneId) => starts.get(laneId))).toEqual(
      laneIds,
    );
    expect(
      orderFinalShootOffLaneIds(laneIds, 'SEQUENTIAL', 'FINAL_START_NUMBER_ASCENDING', (laneId) => starts.get(laneId)),
    ).toEqual(['lane-a', 'lane-b', 'lane-c']);
  });

  it('rejects missing or duplicate Finals Start Numbers for sequential execution', () => {
    expect(() =>
      orderFinalShootOffLaneIds(['lane-a', 'lane-b'], 'SEQUENTIAL', 'FINAL_START_NUMBER_ASCENDING', () => 1),
    ).toThrow('unique Finals Start Numbers');
    expect(() =>
      orderFinalShootOffLaneIds(['lane-a', 'lane-b'], 'SEQUENTIAL', 'FINAL_START_NUMBER_ASCENDING', (laneId) =>
        laneId === 'lane-a' ? 1 : undefined,
      ),
    ).toThrow('Finals Start Number is missing');
  });
});
