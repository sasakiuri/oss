// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { localProgressControls } from '@/renderer/presentation/policies/localProgressControls';

describe('interruption progress and athlete controls', () => {
  it.each(['PAUSED', 'RESUME_PENDING'])(
    'keeps athlete Sighting/Match available during %s while locking progress',
    (status) => {
      const membership = {
        hydrated: true,
        hydrationFailed: false,
        membership: { competitionId: 'joined', revision: 1 },
      };
      const competition = {
        phase: 'ACTIVE',
        interruption: { status },
        athleteTargetControlLoaded: true,
        athleteTargetControl: {
          officialSighting: false,
          matchUnavailableReason: null,
          sightingAllowed: true,
          matchAllowed: true,
          selected: null,
          effective: 'MATCH' as const,
        },
      };
      expect(localProgressControls(membership, 'sighting', competition).allowed).toBe(true);
      expect(localProgressControls(membership, 'match', competition).allowed).toBe(true);
      expect(localProgressControls(membership, 'progress', competition)).toMatchObject({
        allowed: false,
        reason: 'Await Director instruction',
      });
    },
  );
  it('uses the hydration reason rather than implying standalone before membership is known', () => {
    expect(
      localProgressControls({ membership: null, hydrated: false, hydrationFailed: false }, 'progress', {
        phase: 'ACTIVE',
        interruption: { status: 'PAUSED' },
        athleteTargetControl: null,
      }),
    ).toMatchObject({ reason: 'Director membership is not yet available' });
  });
});
