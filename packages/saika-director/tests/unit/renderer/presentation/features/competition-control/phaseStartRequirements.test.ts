// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { buildPhaseStartConfirmation } from '@/renderer/presentation/features/competition-control/phaseStartRequirements';

describe('buildPhaseStartConfirmation', () => {
  it('formats extensible requirements and returns their acknowledgement IDs', () => {
    expect(
      buildPhaseStartConfirmation('SIGHTING', [
        {
          id: 'setup-complete',
          description: 'Setup is complete.',
          timing: { durationSeconds: 600, qualifier: 'REQUIRED' },
        },
        {
          id: 'local-check',
          description: 'The local safety check is complete.',
          timing: { durationSeconds: 120, qualifier: 'MINIMUM' },
        },
      ]),
    ).toEqual({
      acknowledgedRequirementIds: ['setup-complete', 'local-check'],
      message:
        'Before starting Preparation and Sighting, confirm all operational requirements:\n' +
        '- Setup is complete. Required allowance: 10 min.\n' +
        '- The local safety check is complete. Minimum interval: 2 min.',
    });
  });

  it('formats approximate guidance without treating it as a fixed timer', () => {
    expect(
      buildPhaseStartConfirmation('MATCH', [
        {
          id: 'targets-reset',
          description: 'All targets are reset.',
          timing: { durationSeconds: 30, qualifier: 'APPROXIMATE' },
        },
      ])?.message,
    ).toMatch(/MATCH firing.*Rule guidance: approximately 30 sec/s);
  });

  it('does not prompt when a competition type has no requirements', () => {
    expect(buildPhaseStartConfirmation('MATCH', undefined)).toBeNull();
    expect(buildPhaseStartConfirmation('MATCH', [])).toBeNull();
  });
});
