// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it } from 'vitest';

import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';
import { useDirectorMembershipStore } from '@/renderer/presentation/stores/directorMembershipStore';
import { isProgressAllowed } from '@/renderer/presentation/stores/localProgressPermission';

describe('isProgressAllowed', () => {
  afterEach(() => {
    useDirectorMembershipStore.setState({ membership: null, hydrated: false, hydrationFailed: false });
    useCompetitionStore.getState().setInterruption(null);
  });

  it('reads the current membership and competition stores', () => {
    expect(isProgressAllowed()).toBe(false);

    useDirectorMembershipStore.getState().completeHydration({ competitionId: null, revision: 1 });
    expect(isProgressAllowed()).toBe(true);

    useCompetitionStore.getState().setInterruption({ status: 'PAUSED' } as never);
    expect(isProgressAllowed()).toBe(false);
  });
});
