// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import type { RoundConfig } from '@/main/modules/competition/domain/CompetitionTypeDefinition';
import { resolveCompetitionShotPlacement } from '@/main/modules/mqtt/application/ShotCompetitionPlacement';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Shot } from '@/main/modules/session/domain/Shot';

function shot(shotNumber: number, seriesNumber: number): Shot {
  return Shot.create({
    impactPoint: null,
    score: new Score(100),
    mode: Mode.match(),
    timestamp: new Date(`2026-08-28T00:00:${String(shotNumber).padStart(2, '0')}.000Z`),
    shotNumber,
    seriesNumber,
    innerTen: false,
  });
}

const config = {
  name: 'Qualification',
  shotsPerSeries: 10,
  acc: 'DECIMAL',
  stages: [
    { name: 'Preparation', scored: false, requiresNewSession: false, series: [{ maxShots: 0 }] },
    {
      name: 'Match A',
      scored: true,
      requiresNewSession: false,
      series: [{ maxShots: 10 }, { maxShots: 10 }],
    },
    { name: 'Break', scored: false, requiresNewSession: false, series: [{ maxShots: 0 }] },
    { name: 'Match B', scored: true, requiresNewSession: false, series: [{ maxShots: 10 }] },
  ],
} as RoundConfig;

describe('resolveCompetitionShotPlacement', () => {
  it('uses the position within a series instead of the session-global shot number', () => {
    const first = shot(21, 3);
    const second = shot(22, 3);

    expect(resolveCompetitionShotPlacement(second, [first, second], config, 3, 0)).toEqual({
      stageIndex: 3,
      seriesIndex: 0,
      shotNumberInSeries: 2,
    });
  });

  it('maps a flattened session series across independently configured scored stages', () => {
    const result = resolveCompetitionShotPlacement(shot(11, 2), [shot(11, 2)], config, 1, 0);

    expect(result).toEqual({ stageIndex: 1, seriesIndex: 1, shotNumberInSeries: 1 });
  });

  it('skips a zero-shot position-change interval when mapping session series', () => {
    const positionConfig = {
      ...config,
      stages: [
        config.stages[0]!,
        {
          ...config.stages[1]!,
          series: [
            { maxShots: 10 },
            { maxShots: 10 },
            { maxShots: 0, purpose: 'POSITION_CHANGE_AND_SIGHTING' as const },
          ],
        },
        { name: 'Standing', scored: true, requiresNewSession: false, series: [{ maxShots: 5 }] },
      ],
    } as RoundConfig;

    expect(resolveCompetitionShotPlacement(shot(21, 3), [shot(21, 3)], positionConfig, 2, 0)).toEqual({
      stageIndex: 2,
      seriesIndex: 0,
      shotNumberInSeries: 1,
    });
  });
});
