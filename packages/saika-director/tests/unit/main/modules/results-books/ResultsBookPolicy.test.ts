import { describe, expect, it } from 'vitest';

import {
  assertRecordCode,
  assertRecordTransition,
  recordClaimStatus,
  requiredResultsBookSigners,
} from '@/main/modules/results-books';

describe('ResultsBookPolicy', () => {
  it('requires every active TD and Jury Chairman as a Results Book signer', () => {
    const officials = [
      { appointmentId: 'td-1', role: 'TECHNICAL_DELEGATE' as const, officialName: 'TD A', organization: null },
      { appointmentId: 'jury-1', role: 'RTS_JURY_CHAIR' as const, officialName: 'Chair A', organization: null },
      { appointmentId: 'jury-2', role: 'RANGE_JURY_CHAIR' as const, officialName: 'Chair B', organization: null },
      { appointmentId: 'ro-1', role: 'RANGE_OFFICER' as const, officialName: 'RO A', organization: null },
    ];

    expect(requiredResultsBookSigners(officials).map((official) => official.appointmentId)).toEqual([
      'td-1',
      'jury-1',
      'jury-2',
    ]);
  });

  it('validates record scope, threshold and Olympic Games declarations', () => {
    expect(() =>
      assertRecordCode({
        code: 'QWR',
        resultScope: 'QUALIFICATION',
        resultBasis: 'QUALIFICATION_OR_ELIMINATION',
        scoreX10: 6324,
        benchmarkScoreX10: 6323,
        olympicGamesConfirmed: false,
      }),
    ).not.toThrow();
    expect(() =>
      assertRecordCode({
        code: 'EQWR',
        resultScope: 'QUALIFICATION',
        resultBasis: 'QUALIFICATION_OR_ELIMINATION',
        scoreX10: 6324,
        benchmarkScoreX10: 6323,
        olympicGamesConfirmed: false,
      }),
    ).toThrow('equal');
    expect(() =>
      assertRecordCode({
        code: 'OR',
        resultScope: 'FINAL',
        resultBasis: 'FINAL',
        scoreX10: 2529,
        benchmarkScoreX10: 2528,
        olympicGamesConfirmed: false,
      }),
    ).toThrow('Olympic Games');
    expect(() =>
      assertRecordCode({
        code: 'WR',
        resultScope: 'QUALIFICATION',
        resultBasis: 'QUALIFICATION_OR_ELIMINATION',
        scoreX10: 6324,
        benchmarkScoreX10: 6323,
        olympicGamesConfirmed: false,
      }),
    ).toThrow('record result basis');
    expect(() =>
      assertRecordCode({
        code: 'WRJ',
        resultScope: 'QUALIFICATION',
        resultBasis: 'RECOGNIZED_NO_FINAL_TOTAL',
        scoreX10: 6324,
        benchmarkScoreX10: 6323,
        olympicGamesConfirmed: false,
      }),
    ).not.toThrow();
    expect(() =>
      assertRecordCode({
        code: 'OR',
        resultScope: 'QUALIFICATION',
        resultBasis: 'RECOGNIZED_NO_FINAL_TOTAL',
        scoreX10: 6324,
        benchmarkScoreX10: 6323,
        olympicGamesConfirmed: true,
      }),
    ).toThrow('recognized non-Olympic');
  });

  it('enforces the TD, submission and Technical Committee sequence', () => {
    expect(recordClaimStatus([])).toBe('DRAFT');
    expect(() => assertRecordTransition('DRAFT', 'SUBMITTED')).toThrow('TD confirmation');
    expect(() => assertRecordTransition('DRAFT', 'TD_CONFIRMED')).not.toThrow();
    expect(() => assertRecordTransition('TD_CONFIRMED', 'SUBMITTED')).not.toThrow();
    expect(() => assertRecordTransition('SUBMITTED', 'TECHNICAL_COMMITTEE_VERIFIED')).not.toThrow();
    expect(() => assertRecordTransition('VERIFIED', 'VOID')).not.toThrow();
    expect(() => assertRecordTransition('VERIFIED', 'REJECTED')).toThrow('final');

    expect(
      recordClaimStatus([{ type: 'TD_CONFIRMED' }, { type: 'SUBMITTED' }, { type: 'REJECTED' }, { type: 'REOPENED' }]),
    ).toBe('DRAFT');
  });
});
