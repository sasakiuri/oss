import { describe, expect, it } from 'vitest';

import {
  defineRulePack,
  findEstComplaintProcedure,
  identifyRulePack,
  ISSF_2026_10M_RULE_PACKS,
  ISSF_2026_10M_MIXED_RULE_PACKS,
  ISSF_2026_50M_RIFLE_RULE_PACKS,
  ISSF_2026_25M_PISTOL_FINAL_RULE_PACKS,
  ISSF_2026_AR60_FINAL,
} from '../src';

const finals = [
  ...ISSF_2026_10M_RULE_PACKS,
  ...ISSF_2026_10M_MIXED_RULE_PACKS,
  ...ISSF_2026_50M_RIFLE_RULE_PACKS,
  ...ISSF_2026_25M_PISTOL_FINAL_RULE_PACKS,
].filter((pack) => pack.round === 'FINAL');

describe('Final EST complaint procedures', () => {
  it.each(finals)('$eventCode distinguishes a score protest from a Final target complaint', (pack) => {
    const capability = pack.capabilities.estComplaints;
    expect(findEstComplaintProcedure(capability, 'MATCH', 'SHOT_VALUE')).toMatchObject({
      review: 'OFFICIAL_REVIEW',
      ruleReference: '6.17.1.7',
    });
    expect(findEstComplaintProcedure(capability, 'SIGHTING', 'SHOT_NOT_REGISTERED')).toMatchObject({
      review: 'FINAL_EST_COMPLAINT',
      ruleReference: '6.17.1.8(a)',
    });
    expect(findEstComplaintProcedure(capability, 'MATCH', 'SHOT_NOT_REGISTERED')).toMatchObject({
      review: 'FINAL_EST_COMPLAINT',
      ruleReference: '6.17.1.8(b)-(d)',
    });
  });

  it('supports a separately versioned local complaint policy without changing ISSF definitions', () => {
    const source = ISSF_2026_AR60_FINAL;
    const local = defineRulePack({
      ...source,
      id: 'LOCAL:FINAL',
      capabilities: {
        ...source.capabilities,
        estComplaints: {
          procedures: [
            {
              phase: 'MATCH',
              issue: 'SHOT_VALUE',
              review: 'SCORE_PROTEST',
              ruleReference: 'Local 1',
              athleteGuidance: 'Contact the official.',
              officialGuidance: 'Review the local protest.',
            },
          ],
        },
      },
    });
    expect(findEstComplaintProcedure(local.capabilities.estComplaints, 'MATCH', 'SHOT_VALUE')?.review).toBe(
      'SCORE_PROTEST',
    );
    expect(identifyRulePack(local).fingerprint.value).not.toBe(identifyRulePack(source).fingerprint.value);
    expect(findEstComplaintProcedure(source.capabilities.estComplaints, 'MATCH', 'SHOT_VALUE')?.review).toBe(
      'OFFICIAL_REVIEW',
    );
  });

  it('rejects ambiguous procedures for the same phase and issue', () => {
    const source = ISSF_2026_AR60_FINAL;
    const procedure = source.capabilities.estComplaints!.procedures[0]!;
    expect(() =>
      defineRulePack({
        ...source,
        capabilities: {
          ...source.capabilities,
          estComplaints: { procedures: [procedure, procedure] },
        },
      }),
    ).toThrow('Duplicate EST complaint procedure');
  });
});
