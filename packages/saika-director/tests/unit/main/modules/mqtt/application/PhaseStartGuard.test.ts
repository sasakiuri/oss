// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { assertPhaseStartReady } from '@/main/modules/mqtt/application/PhaseStartGuard';
import type { CompetitionTypeDefinition } from '@/shared/competitionTypes';
import { BR60S } from '@/shared/competitionTypes/definitions/BR60S';

const guardedDefinition: CompetitionTypeDefinition = {
  ...BR60S,
  id: 'GUARDED',
  phaseStartRequirements: {
    MATCH: [
      { id: 'targets-reset', description: 'All targets are reset.' },
      { id: 'range-clear', description: 'The range is clear.' },
    ],
  },
};

describe('assertPhaseStartReady', () => {
  it('requires every acknowledgement configured for the requested phase', () => {
    expect(() => assertPhaseStartReady(guardedDefinition, 'MATCH', ['targets-reset'])).toThrow(/range-clear/);
    expect(() => assertPhaseStartReady(guardedDefinition, 'MATCH', ['range-clear'])).toThrow(/targets-reset/);
    expect(() => assertPhaseStartReady(guardedDefinition, 'MATCH', ['targets-reset', 'range-clear'])).not.toThrow();
  });

  it('does not couple unconfigured phases or local competition types to acknowledgements', () => {
    expect(() => assertPhaseStartReady(guardedDefinition, 'SIGHTING', undefined)).not.toThrow();
    expect(() => assertPhaseStartReady(BR60S, 'MATCH', undefined)).not.toThrow();
  });
});
