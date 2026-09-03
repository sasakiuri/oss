// SPDX-License-Identifier: MIT
import { ISSF_2026_AR60_FINAL, ISSF_2026_P25_FINAL, ISSF_2026_R3P_FINAL } from '@sasakiuri/saika-rules';
import { describe, expect, it } from 'vitest';

import {
  AP60,
  AP60_FINAL,
  AR60,
  AR60_FINAL,
  R3P60,
  R3P60_INDOOR,
  R3P_FINAL,
  RPR60,
} from '@/main/modules/competition/domain/competitionTypes';
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

  it('registers 50m courses and retains position-change metadata', () => {
    expect(R3P60.discipline).toBe('RIFLE_50M');
    expect(R3P60.config.stages[1]?.timer?.durationSeconds).toBe(6300);
    expect(R3P60.config.stages[1]?.series[2]?.targetModeControl).toBe('ATHLETE');
    expect(R3P60.config.stages[1]?.series[4]?.targetModeControl).toBe('ATHLETE');
    expect(R3P60_INDOOR.config.stages[1]?.timer?.durationSeconds).toBe(5400);
    expect(RPR60.config.acc).toBe('DECIMAL');
    expect(R3P_FINAL.config.stages[1]?.series[2]).toEqual({
      maxShots: 0,
      label: 'Standing changeover and sighting',
      position: 'STANDING',
      purpose: 'POSITION_CHANGE_AND_SIGHTING',
      targetModeControl: 'ATHLETE',
    });

    const adapted = competitionTypeFromRulePack(ISSF_2026_R3P_FINAL);
    expect(adapted.config.stages[2]?.series[0]?.timer?.durationSeconds).toBe(250);
    expect(adapted.config.stages[3]?.series[0]?.shotTimer?.durationSeconds).toBe(50);
  });

  it('persists result projection independently from source scoring', () => {
    const definition = competitionTypeFromRulePack(ISSF_2026_P25_FINAL);

    expect(definition.config.acc).toBe('DECIMAL');
    expect(definition.targetProfileId).toBe('ISSF_PISTOL_25M_RAPID_FIRE_DECIMAL_2026');
    expect(definition.scoringGaugeProfileId).toBe('ISSF_SMALLBORE_5_60_2026');
    expect(definition.config.scoringGaugeProfileId).toBe('ISSF_SMALLBORE_5_60_2026');
    expect(definition.resultProjection).toMatchObject({ type: 'HIT_MISS', hitThresholdX10: 102 });
    expect(definition.config.resultProjection).toBe(definition.resultProjection);
  });
});
