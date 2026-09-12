import { describe, expect, it } from 'vitest';

import { FinalEstBackupSubjectSource } from '@/main/modules/est-backup-verification';
import type { ResultVerificationSourceSnapshot, VerifiableResult } from '@/main/modules/result-verification';

function harness(mixed = false) {
  const result: VerifiableResult = {
    resultId: 'result',
    participantId: mixed ? 'TEAM:pair-1' : 'athlete',
    rank: 1,
    revision: 'a'.repeat(64),
    playerName: 'Finalist',
    affiliation: 'Club',
    relayNumber: 1,
    totalScore: 250.1,
    entryStatus: null,
    classificationCode: null,
    decisionCount: 1,
    projectionIssues: [],
    status: 'confirmed',
    evidenceSummary: {
      expectedShots: 24,
      linkedShots: 0,
      independentDecimalShots: 0,
      innerTenClassifiedShots: 0,
      scoreConflicts: 0,
    },
  };
  const results = [result];
  const snapshot: ResultVerificationSourceSnapshot = {
    eventId: 'event',
    resultScope: 'FINAL',
    results,
    configuredIndividualChecks: mixed ? 3 : 10,
    configuredTeamChecks: 0,
    teamVerificationSupported: true,
    requiredTeamChecks: 0,
    checkedTeamResults: 0,
    teamVerificationRunId: null,
    teamSnapshotRevision: null,
    sourceRevision: 'b'.repeat(64),
    issues: [],
  };
  const source = new FinalEstBackupSubjectSource(
    { resultScope: 'FINAL', load: async () => snapshot },
    { findByEventId: () => [] },
  );
  return { source, results };
}
describe('Final EST backup subjects', () => {
  it.each([false, true])(
    'preserves comparison identity, interventions and the check revision (Mixed Team: %s)',
    async (mixed) => {
      const { source } = harness(mixed);
      expect(
        await source.load({
          eventId: 'event',
          resultKind: mixed ? 'MIXED_TEAM' : 'INDIVIDUAL',
          keyType: mixed ? 'TEAM_ID' : 'PARTICIPANT_ID',
        }),
      ).toEqual([
        expect.objectContaining({
          key: mixed ? 'pair-1' : 'athlete',
          totalScore: 250.1,
          interventionCount: 1,
          resultBinding: {
            resultId: 'result',
            participantId: mixed ? 'TEAM:pair-1' : 'athlete',
            resultRevision: 'a'.repeat(64),
          },
        }),
      ]);
    },
  );
  it('rejects missing identities, wrong kinds and unresolved results', async () => {
    const { source, results } = harness();
    await expect(source.load({ eventId: 'event', resultKind: 'INDIVIDUAL', keyType: 'START_NUMBER' })).rejects.toThrow(
      'no START_NUMBER',
    );
    await expect(source.load({ eventId: 'event', resultKind: 'MIXED_TEAM', keyType: 'TEAM_ID' })).rejects.toThrow(
      'kind does not match',
    );
    results[0] = { ...results[0]!, status: 'published' };
    await expect(
      source.load({ eventId: 'event', resultKind: 'INDIVIDUAL', keyType: 'PARTICIPANT_ID' }),
    ).rejects.toThrow('Complete the Final');
  });
});
