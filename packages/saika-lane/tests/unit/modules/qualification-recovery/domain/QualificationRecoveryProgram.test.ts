// SPDX-License-Identifier: MIT
import { ISSF_2026_P25, ISSF_2026_RFPM } from '@sasakiuri/saika-rules';
import { describe, expect, it } from 'vitest';

import { buildQualificationRecoveryProgram } from '@/main/modules/qualification-recovery';

function program(pack: typeof ISSF_2026_P25, id: string) {
  const value = pack.capabilities.timedTarget?.programs.find((candidate) => candidate.id === id);
  if (!value) throw new Error(`Missing fixture program ${id}`);
  return value;
}

describe('buildQualificationRecoveryProgram', () => {
  it('uses the complete unchanged MATCH program for ANNUL_AND_REPEAT', () => {
    const matchProgram = program(ISSF_2026_RFPM, 'RFP_MATCH_8');

    expect(
      buildQualificationRecoveryProgram({
        authorization: {
          phase: 'SERIES_RECOVERY',
          seriesRecovery: {
            treatment: 'ANNUL_AND_REPEAT',
            shotsToFire: 5,
            execution: { mode: 'SAME_TIMED_TARGET_PROGRAM' },
          },
        },
        matchProgram,
      }),
    ).toBe(matchProgram);
  });

  it('derives the 48 seconds-per-shot precision completion without changing the program identity', () => {
    const matchProgram = program(ISSF_2026_P25, 'P25_MATCH_PRECISION_240');
    const recovery = buildQualificationRecoveryProgram({
      authorization: {
        phase: 'SERIES_RECOVERY',
        seriesRecovery: {
          treatment: 'COMPLETE_REMAINING_SHOTS',
          shotsToFire: 2,
          execution: { mode: 'SECONDS_PER_SHOT', secondsPerShot: 48, totalSeconds: 96 },
        },
      },
      matchProgram,
    });

    expect(recovery).toMatchObject({
      id: matchProgram.id,
      purpose: 'MATCH',
      loadPreparationSeconds: 60,
      attentionDelayMilliseconds: 7_000,
      exposures: [{ nominalDurationMilliseconds: 96_000, maximumShots: 2 }],
    });
  });

  it('starts at the first rapid exposure and retains only the exposures needed for remaining shots', () => {
    const matchProgram = program(ISSF_2026_P25, 'P25_MATCH_RAPID_3_7');
    const recovery = buildQualificationRecoveryProgram({
      authorization: {
        phase: 'SERIES_RECOVERY',
        seriesRecovery: {
          treatment: 'COMPLETE_REMAINING_SHOTS',
          shotsToFire: 3,
          execution: { mode: 'FIRST_EXPOSURE_OF_NEXT_SERIES' },
        },
      },
      matchProgram,
    });

    expect(recovery.id).toBe(matchProgram.id);
    expect(recovery.exposures).toHaveLength(3);
    expect(recovery.exposures).toEqual(matchProgram.exposures.slice(0, 3));
  });

  it('limits an extra sighting program to the explicitly authorized shots', () => {
    const recovery = buildQualificationRecoveryProgram({
      authorization: { phase: 'EXTRA_SIGHTING', shotsToFire: 3 },
      matchProgram: program(ISSF_2026_P25, 'P25_MATCH_PRECISION_240'),
      sightingProgram: program(ISSF_2026_P25, 'P25_SIGHTING_PRECISION_240'),
    });

    expect(recovery).toMatchObject({
      id: 'P25_SIGHTING_PRECISION_240',
      purpose: 'SIGHTING',
      exposures: [{ maximumShots: 3 }],
    });
  });

  it('rejects non-firing decisions and incomplete repeat programs', () => {
    const matchProgram = program(ISSF_2026_RFPM, 'RFP_MATCH_8');
    expect(() =>
      buildQualificationRecoveryProgram({
        authorization: {
          phase: 'SERIES_RECOVERY',
          seriesRecovery: { treatment: 'KEEP_RECORDED_SERIES', shotsToFire: 0, execution: null },
        },
        matchProgram,
      }),
    ).toThrow('does not require a firing program');
    expect(() =>
      buildQualificationRecoveryProgram({
        authorization: {
          phase: 'SERIES_RECOVERY',
          seriesRecovery: {
            treatment: 'ANNUL_AND_REPEAT',
            shotsToFire: 4,
            execution: { mode: 'SAME_TIMED_TARGET_PROGRAM' },
          },
        },
        matchProgram,
      }),
    ).toThrow('complete 5-shot program');
  });
});
