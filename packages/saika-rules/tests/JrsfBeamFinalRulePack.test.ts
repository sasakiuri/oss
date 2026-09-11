// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { defineRulePack, identifyRulePack, JRSF_2026_RULE_PACKS, RulePackRegistry } from '../src';

describe('JRSF 2026 Beam Final Rule Packs', () => {
  it.each(JRSF_2026_RULE_PACKS)('validates $eventCode as an independent domestic Final procedure', (pack) => {
    expect(defineRulePack(pack)).toBe(pack);
    expect(pack.id).toBe(`JRSF:2026:${pack.eventCode}:FINAL`);
    expect(pack.authority).toMatchObject({ organization: 'JRSF', effectiveFrom: '2026-04-01' });
    const registry = new RulePackRegistry(JRSF_2026_RULE_PACKS);
    expect(registry.findForEvent(pack.eventCode, '2026-03-31')).toBeNull();
    expect(registry.findForEvent(pack.eventCode, '2026-04-01')).toBe(pack);
    expect(identifyRulePack(pack).fingerprint.value).toMatch(/^[a-f0-9]{64}$/);
    expect(pack.capabilities.target.scoringProfileId).toContain('JRSF_BEAM_');
    expect(pack.capabilities.scoring.mode).toBe('DECIMAL');
    expect(
      pack.capabilities.courseOfFire.stages.flatMap((stage) => stage.series).reduce((sum, s) => sum + s.shots, 0),
    ).toBe(24);
    expect(pack.capabilities.estComplaints).toBeUndefined();
    expect(pack.capabilities.qualificationMalfunction).toBeUndefined();

    const script = pack.capabilities.commands!.finalScript!;
    expect(script.version).toContain('JRSF-2026');
    expect(script.source?.organization).toBe('JRSF');
    expect([...script.main, ...script.shootOff].every((step) => step.id.startsWith('jrsf.2026.'))).toBe(true);
    expect([...script.main, ...script.shootOff].every((step) => step.ruleReference.includes('JRSF 2026 6.17.5-'))).toBe(
      true,
    );
    expect(
      script.main
        .filter((step) => step.effect.type === 'CHECKPOINT')
        .map((step) => (step.effect.type === 'CHECKPOINT' ? step.effect.afterMatchShot : null)),
    ).toEqual([12, 14, 16, 18, 20, 22, 24]);
    expect(script.shootOff.find((step) => step.effect.type === 'OPEN_FIRING')?.effect).toEqual({
      type: 'OPEN_FIRING',
      purpose: 'SHOOT_OFF',
      participantSelection: 'TIED_ONLY',
      durationSeconds: 50,
      shotsPerParticipant: 1,
    });
  });
});
