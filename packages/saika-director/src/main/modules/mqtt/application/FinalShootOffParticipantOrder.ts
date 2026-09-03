// SPDX-License-Identifier: MIT

/** Orders only the transport targets; Final operation membership remains immutable and unordered. */
export function orderFinalShootOffLaneIds(
  laneIds: readonly string[],
  participantExecution: 'SIMULTANEOUS' | 'SEQUENTIAL',
  participantOrder: 'FINAL_START_NUMBER_ASCENDING' | undefined,
  getFinalStartNumber: (laneId: string) => number | undefined,
): string[] {
  const ordered = [...laneIds];
  if (participantExecution === 'SIMULTANEOUS') {
    if (participantOrder !== undefined) throw new Error('A simultaneous shoot-off must not define an order');
    return ordered;
  }
  if (participantOrder !== 'FINAL_START_NUMBER_ASCENDING') {
    throw new Error('A sequential shoot-off requires Finals Start Number order');
  }

  const startNumbers = new Map<string, number>();
  for (const laneId of ordered) {
    const startNumber = getFinalStartNumber(laneId);
    if (startNumber === undefined) {
      throw new Error(`Finals Start Number is missing for sequential shoot-off Lane ${laneId}`);
    }
    startNumbers.set(laneId, startNumber);
  }
  if (new Set(startNumbers.values()).size !== ordered.length) {
    throw new Error('Sequential shoot-off requires unique Finals Start Numbers');
  }
  return ordered.sort((left, right) => startNumbers.get(left)! - startNumbers.get(right)!);
}
