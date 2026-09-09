import { describe, expect, it } from 'vitest';

import {
  canonicalJson,
  defineRulePack,
  identifyRulePack,
  ISSF_2026_AR60,
  ISSF_2026_AR60_FINAL,
  ISSF_2026_P25,
  ISSF_2026_RULE_PACKS,
  type RulePack,
} from '../src';
import { defineRulePack as defineFromLegacyPath } from '../src/RulePack';

describe('Rule Pack compatibility', () => {
  it('retains the identity of every shipped pack used by stored results and MQTT bindings', () => {
    expect(ISSF_2026_RULE_PACKS.map(identifyRulePack)).toMatchSnapshot();
  });

  it.each(ISSF_2026_RULE_PACKS.map((pack) => [pack.id, pack] as const))(
    'validates and freezes %s without normalizing or replacing its content',
    (_id, source) => {
      const pack = structuredClone(source);
      const serialized = canonicalJson(pack);

      expect(defineRulePack(pack)).toBe(pack);
      expect(canonicalJson(pack)).toBe(serialized);
      expectDeeplyFrozen(pack);
    },
  );

  it('preserves the existing definition import path', () => {
    expect(defineFromLegacyPath).toBe(defineRulePack);
  });

  const invalidPacks: ReadonlyArray<readonly [string, RulePack, string]> = [
    [
      'course totals before command validation',
      {
        ...ISSF_2026_AR60,
        capabilities: {
          ...ISSF_2026_AR60.capabilities,
          ranking: { ...ISSF_2026_AR60.capabilities.ranking, totalShots: 1 },
          commands: { ...ISSF_2026_AR60.capabilities.commands!, preparationAndSightingSeconds: 0 },
        },
      },
      'ranking.totalShots must equal the course of fire total (60)',
    ],
    [
      'missing timing capability referenced by the course',
      { ...ISSF_2026_P25, capabilities: { ...ISSF_2026_P25.capabilities, timedTarget: undefined } },
      'courseOfFire references a missing timedTarget capability',
    ],
    [
      'Final scripts attached to Qualification',
      { ...ISSF_2026_AR60_FINAL, round: 'QUALIFICATION' },
      'commands.finalScript is only valid for Finals',
    ],
    [
      'source scoring incompatible with result projection',
      {
        ...ISSF_2026_AR60,
        capabilities: {
          ...ISSF_2026_AR60.capabilities,
          scoring: { ...ISSF_2026_AR60.capabilities.scoring, mode: 'RING' },
          resultProjection: {
            type: 'HIT_MISS',
            source: 'EFFECTIVE_SCORE_X10',
            displayUnit: 'HITS',
            preserveSourceScore: true,
            hitThresholdX10: 102,
            hitValueX10: 10,
            missValueX10: 0,
            ruleReference: 'test',
          },
        },
      },
      'HIT_MISS result projection requires DECIMAL source scoring',
    ],
  ];

  it.each(invalidPacks)(
    'preserves validation errors for %s without freezing rejected input',
    (_name, source, error) => {
      const pack = structuredClone(source);
      const serialized = canonicalJson(pack);

      expect(() => defineRulePack(pack)).toThrowError(error);
      expect(Object.isFrozen(pack)).toBe(false);
      expect(Object.isFrozen(pack.capabilities.courseOfFire)).toBe(false);
      expect(canonicalJson(pack)).toBe(serialized);
    },
  );
});

function expectDeeplyFrozen(value: unknown): void {
  if (typeof value !== 'object' || value === null) return;
  expect(Object.isFrozen(value)).toBe(true);
  Object.values(value).forEach(expectDeeplyFrozen);
}
