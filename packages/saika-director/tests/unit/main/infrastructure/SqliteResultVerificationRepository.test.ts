import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migration013ResultVerification } from '@/main/infrastructure/database/migrations/013_result_verification';
import { migration077ResultApprovalSigningIdentity } from '@/main/infrastructure/database/migrations/077_result_approval_signing_identity';
import { ResultListApprovalEntry } from '@/main/modules/result-verification/domain/ResultListApprovalEntry';
import { ResultVerificationCheck } from '@/main/modules/result-verification/domain/ResultVerificationCheck';
import { SqliteResultVerificationRepository } from '@/main/modules/result-verification/infra/SqliteResultVerificationRepository';

describe('SqliteResultVerificationRepository', () => {
  let database: Database.Database;
  let repository: SqliteResultVerificationRepository;

  beforeEach(() => {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    migration013ResultVerification.up(database);
    migration077ResultApprovalSigningIdentity.up(database);
    repository = new SqliteResultVerificationRepository(database);
  });

  afterEach(() => database.close());

  it('retains checks, approvals, and approval revocations as append-only audit entries', () => {
    const check = ResultVerificationCheck.create({
      eventId: '11111111-1111-4111-8111-111111111111',
      resultId: '22222222-2222-4222-8222-222222222222',
      participantId: 'participant-1',
      playerName: 'Athlete One',
      resultRevision: 'a'.repeat(64),
      resultRank: 1,
      scoreX10: 6234,
      decisionCountAtCheck: 1,
      evidenceSource: 'INDEPENDENT_MEMORY',
      evidenceReference: 'Memory export 42',
      comparisonStatus: 'MATCHED',
      manualInterventionsReviewed: true,
      note: 'IR-12 reviewed',
      officialName: 'RTS Jury A',
      checkedAt: new Date('2026-08-28T00:00:00.000Z'),
    });
    const approval = ResultListApprovalEntry.createApproval({
      eventId: check.eventId,
      resultScope: 'QUALIFICATION',
      snapshotRevision: 'b'.repeat(64),
      requiredIndividualChecks: 1,
      requiredTeamChecks: 0,
      checkIds: [check.id],
      statement: 'Official Final Results verified',
      officialName: 'RTS Jury B',
      recordedAt: new Date('2026-08-28T00:01:00.000Z'),
      signingEvidence: {
        method: 'AUTHENTICATED',
        actorId: '33333333-3333-4333-8333-333333333333',
        recordedBy: 'RTS Jury B',
        evidenceReference: null,
      },
    });
    const revocation = ResultListApprovalEntry.createRevocation(approval, {
      reason: 'Superseded after a corrected result',
      officialName: 'RTS Jury B',
      recordedAt: new Date('2026-08-28T00:02:00.000Z'),
    });
    const laterCheckAtTheSameInstant = ResultVerificationCheck.create({
      eventId: check.eventId,
      resultId: check.resultId,
      participantId: check.participantId,
      playerName: check.playerName,
      resultRevision: check.resultRevision,
      resultRank: check.resultRank,
      scoreX10: check.scoreX10,
      decisionCountAtCheck: check.decisionCountAtCheck,
      evidenceSource: 'TARGET_PRINTOUT',
      evidenceReference: 'Printout 42',
      comparisonStatus: 'MATCHED',
      manualInterventionsReviewed: true,
      officialName: 'RTS Jury B',
      checkedAt: check.checkedAt,
    });

    repository.appendCheck(check);
    repository.appendCheck(laterCheckAtTheSameInstant);
    repository.appendApprovalEntry(approval);
    repository.appendApprovalEntry(revocation);

    expect(repository.findChecksByEvent(check.eventId)).toEqual([check, laterCheckAtTheSameInstant]);
    expect(repository.findApprovalEntryById(approval.id)).toEqual(approval);
    expect(repository.findApprovalEntriesByEvent(check.eventId, 'QUALIFICATION')).toEqual([approval, revocation]);
    expect(database.prepare('SELECT COUNT(*) AS count FROM result_list_approval_entries').get()).toEqual({ count: 2 });
  });
});
