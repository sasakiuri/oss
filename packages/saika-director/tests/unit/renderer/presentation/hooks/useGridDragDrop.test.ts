// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { isParticipantDropValid } from '@/renderer/presentation/hooks/useGridDragDrop';

describe('isParticipantDropValid', () => {
  it('rejects adding a participant who is already assigned to another relay', () => {
    expect(isParticipantDropValid([['participant-1'], [null]], 'participant-1', 1, 0, null)).toBe(false);
  });

  it('allows adding an unassigned participant', () => {
    expect(isParticipantDropValid([['participant-1'], [null]], 'participant-2', 1, 0, null)).toBe(true);
  });

  it('allows moving an assigned participant between relays', () => {
    expect(
      isParticipantDropValid(
        [
          ['participant-1', null],
          ['participant-2', null],
        ],
        'participant-1',
        1,
        0,
        { relayIdx: 0, fpIdx: 0 },
      ),
    ).toBe(true);
  });

  it('rejects a swap that would duplicate the displaced participant', () => {
    expect(
      isParticipantDropValid(
        [
          ['participant-1', 'participant-2'],
          ['participant-2', null],
        ],
        'participant-1',
        1,
        0,
        { relayIdx: 0, fpIdx: 0 },
      ),
    ).toBe(false);
  });
});
