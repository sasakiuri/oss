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
  it.each([
    [{ membership: null, hydrated: false, hydrationFailed: true }, 'Director membership could not be loaded'],
    [{ membership: null, hydrated: true, hydrationFailed: false }, 'Director membership is not yet available'],
  ])('gives the membership reason during an interruption and without one', (membershipState, reason) => {
    const interrupted = { phase: 'ACTIVE', interruption: { status: 'PAUSED' }, athleteTargetControl: null };

    expect(localProgressControls(membershipState, 'progress', interrupted)).toEqual({ allowed: false, reason });
    expect(localProgressControls(membershipState)).toEqual({ allowed: false, reason });
  });
  it('tells a standalone stopped run from a Director-controlled one', () => {
    const interrupted = { phase: 'ACTIVE', interruption: { status: 'RESUME_PENDING' }, athleteTargetControl: null };
    const standalone = { membership: { competitionId: null, revision: 1 }, hydrated: true, hydrationFailed: false };

    expect(localProgressControls(standalone, 'progress', interrupted)).toEqual({
      allowed: false,
      reason: 'Finish the stopped saved run before starting again',
    });
    expect(localProgressControls(standalone)).toEqual({ allowed: true, reason: undefined });
    expect(localProgressControls({ ...standalone, membership: { competitionId: 'joined', revision: 2 } })).toEqual({
      allowed: false,
      reason: 'Competition progress is controlled by Director',
    });
  });
});
