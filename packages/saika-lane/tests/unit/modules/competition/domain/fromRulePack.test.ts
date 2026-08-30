// SPDX-License-Identifier: MIT
import { ISSF_2026_AR60_FINAL } from '@sasakiuri/saika-rules';
import { describe, expect, it } from 'vitest';

import { AP60, AP60_FINAL, AR60, AR60_FINAL } from '@/main/modules/competition/domain/competitionTypes';
import { competitionTypeFromRulePack } from '@/main/modules/competition/domain/fromRulePack';

describe('competitionTypeFromRulePack', () => {
  it('keeps Lane qualification behavior tied to the shared Rule Pack version', () => {
    expect(AR60.rulePackId).toBe('ISSF:2026:AR60:QUALIFICATION');
    expect(AR60.discipline).toBe('AIR_RIFLE_10M');
    expect(AR60.config.acc).toBe('DECIMAL');
    expect(AR60.config.stages[0]?.timer?.durationSeconds).toBe(900);
    expect(AR60.config.stages[1]?.timer?.durationSeconds).toBe(4500);
    expect(AP60.config.acc).toBe('RING');
    expect(AR60_FINAL.config.stages[2]?.series).toHaveLength(14);
    expect(AP60_FINAL.config.acc).toBe('DECIMAL');
  });

  it('maps series and per-shot timers without adding Rule Pack knowledge to Lane state', () => {
    const definition = competitionTypeFromRulePack(ISSF_2026_AR60_FINAL);
    const firstStage = definition.config.stages[1]!;
    const eliminationStage = definition.config.stages[2]!;

    expect(firstStage.series.map((series) => series.timer?.durationSeconds)).toEqual([250, 250]);
    expect(eliminationStage.series).toHaveLength(14);
    expect(eliminationStage.series.every((series) => series.maxShots === 1)).toBe(true);
    expect(eliminationStage.series[0]?.shotTimer?.durationSeconds).toBe(50);
    expect(eliminationStage.timer).toBeUndefined();
  });
});
