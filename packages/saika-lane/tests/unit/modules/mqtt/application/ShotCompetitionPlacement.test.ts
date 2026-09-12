// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { AR60_FINAL } from '@/main/modules/competition/domain/competitionTypes';
import { resolveCompetitionShotPlacement } from '@/main/modules/mqtt/application/ShotCompetitionPlacement';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Shot } from '@/main/modules/session/domain/Shot';
import type { ShotCompetitionContext } from '@/main/modules/session/domain/ShotCompetitionContext';

const competition = { id: 'competition', config: AR60_FINAL.config };
function shot(shotNumber: number, context?: ShotCompetitionContext, mode = Mode.match()): Shot {
  return Shot.create({
    impactPoint: null,
    score: new Score(100),
    mode,
    timestamp: new Date(),
    shotNumber,
    seriesNumber: mode.isMatch() ? 1 : 0,
    innerTen: false,
    competitionContext: context,
  });
}

describe('resolveCompetitionShotPlacement', () => {
  it('retains an incomplete series boundary and uses its own shot ordinal', () => {
    const first = shot(1, { competitionId: competition.id, stageIndex: 1, seriesIndex: 0 });
    const second = shot(2, { competitionId: competition.id, stageIndex: 1, seriesIndex: 1 });
    const sighting = shot(3, second.competitionContext, Mode.sighting());
    const third = shot(4, second.competitionContext);
    expect(resolveCompetitionShotPlacement(third, [first, second, sighting, third], competition)).toEqual({
      stageIndex: 1,
      seriesIndex: 1,
      shotNumberInSeries: 2,
    });
    expect(resolveCompetitionShotPlacement(sighting, [first, second, sighting, third], competition)).toEqual({
      stageIndex: 1,
      seriesIndex: 1,
      shotNumberInSeries: 1,
    });
  });

  it('preserves a captured single-shot stage even when the competition has subsequently advanced', () => {
    const recorded = shot(11, { competitionId: competition.id, stageIndex: 2, seriesIndex: 0 });
    expect(resolveCompetitionShotPlacement(recorded, [recorded], competition)).toEqual({
      stageIndex: 2,
      seriesIndex: 0,
      shotNumberInSeries: 1,
    });
  });

  it.each([undefined, { competitionId: 'different-competition', stageIndex: 1, seriesIndex: 0 }])(
    'refuses missing or unrelated competition context: %j',
    (context) => {
      const recorded = shot(1, context);
      expect(() => resolveCompetitionShotPlacement(recorded, [recorded], competition)).toThrow('no verified placement');
    },
  );

  it('rejects coordinates outside the configured course and shots absent from history', () => {
    const invalid = shot(1, { competitionId: competition.id, stageIndex: 99, seriesIndex: 0 });
    expect(() => resolveCompetitionShotPlacement(invalid, [invalid], competition)).toThrow(
      'invalid competition coordinates',
    );
    const valid = shot(1, { competitionId: competition.id, stageIndex: 1, seriesIndex: 0 });
    expect(() => resolveCompetitionShotPlacement(valid, [], competition)).toThrow('absent from its session history');
  });
});
