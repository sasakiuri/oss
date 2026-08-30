import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migration019TargetExaminations } from '@/main/infrastructure/database/migrations/019_target_examinations';
import { TargetExaminationCase } from '@/main/modules/target-examinations/domain/TargetExaminationCase';
import { TargetExaminationEntry } from '@/main/modules/target-examinations/domain/TargetExaminationEntry';
import { TargetExaminationEvidence } from '@/main/modules/target-examinations/domain/TargetExaminationEvidence';
import { TargetExaminationScopeLink } from '@/main/modules/target-examinations/domain/TargetExaminationScopeLink';
import { SqliteTargetExaminationRepository } from '@/main/modules/target-examinations/infra/SqliteTargetExaminationRepository';

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const LANE_ID = '33333333-3333-4333-8333-333333333333';

describe('SqliteTargetExaminationRepository', () => {
  let database: Database.Database;
  let repository: SqliteTargetExaminationRepository;

  beforeEach(() => {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    migration019TargetExaminations.up(database);
    repository = new SqliteTargetExaminationRepository(database);
  });

  afterEach(() => database.close());

  it('persists scoped cases, custody evidence, and same-instant entries in append order', () => {
    const examination = createCase();
    const scope = TargetExaminationScopeLink.create({
      caseId: examination.id,
      scopeType: 'COMPETITION',
      scopeId: COMPETITION_ID,
      linkedBy: 'RTS Officer A',
      linkedAt: new Date('2026-08-31T01:00:01.000Z'),
    });
    const item = TargetExaminationEvidence.create({
      caseId: examination.id,
      type: 'CONTROL_SHEET',
      description: 'Control sheet from firing point 12',
      collectedBy: 'RTS Officer A',
      collectedAt: new Date('2026-08-31T01:01:00.000Z'),
      recordedAt: new Date('2026-08-31T01:02:00.000Z'),
    });
    const recordedAt = new Date('2026-08-31T01:03:00.000Z');
    const note = TargetExaminationEntry.create({
      caseId: examination.id,
      type: 'NOTE',
      statement: 'Target isolated pending examination',
      officialName: 'RTS Officer A',
      recordedAt,
    });
    const release = TargetExaminationEntry.create({
      caseId: examination.id,
      type: 'HOLD_RELEASED',
      statement: 'Release authorized',
      ruleReference: 'ISSF 6.10.8.3',
      officialName: 'RTS Jury A',
      recordedAt,
    });

    repository.appendCase(examination, [scope]);
    repository.appendEvidence(item);
    repository.appendEntry(note);
    repository.appendEntry(release);

    expect(repository.findCaseById(examination.id)).toEqual(examination);
    expect(repository.findAllCases()).toEqual([examination]);
    expect(repository.findCasesByScope({ scopeType: 'COMPETITION', scopeId: COMPETITION_ID })).toEqual([examination]);
    expect(repository.findScopesByCaseIds([examination.id]).get(examination.id)).toEqual([scope]);
    expect(repository.findEvidenceByCaseIds([examination.id]).get(examination.id)).toEqual([item]);
    expect(repository.findEntriesByCaseIds([examination.id]).get(examination.id)).toEqual([note, release]);
    expect(repository.findActiveEvidenceHolds({ scopeType: 'COMPETITION', scopeId: COMPETITION_ID }, LANE_ID)).toEqual(
      [],
    );
  });

  it('applies whole-competition holds to every Lane and rejects mutation or deletion', () => {
    const examination = createCase(null);
    const scope = TargetExaminationScopeLink.create({
      caseId: examination.id,
      scopeType: 'COMPETITION',
      scopeId: COMPETITION_ID,
      linkedBy: 'RTS Officer A',
    });
    repository.appendCase(examination, [scope]);

    expect(
      repository.findActiveEvidenceHolds(
        { scopeType: 'COMPETITION', scopeId: COMPETITION_ID },
        '44444444-4444-4444-8444-444444444444',
      ),
    ).toEqual([examination]);
    expect(() =>
      database.prepare('UPDATE target_examination_cases SET summary = ? WHERE id = ?').run('Changed', examination.id),
    ).toThrow('append-only');
    expect(() => database.prepare('DELETE FROM target_examination_scope_links WHERE id = ?').run(scope.id)).toThrow(
      'append-only',
    );
  });
});

function createCase(laneId: string | null = LANE_ID): TargetExaminationCase {
  return TargetExaminationCase.create({
    issueKind: 'NO_SHOT_INDICATION',
    occurredAt: new Date('2026-08-31T01:00:00.000Z'),
    ...(laneId ? { laneId } : {}),
    firingPointNumber: laneId ? 12 : undefined,
    summary: 'Expected shot was not shown',
    details: 'The EST monitor did not change after the athlete reported firing.',
    ruleReferences: 'ISSF 6.10.5, 6.10.8',
    openedBy: 'RTS Officer A',
    createdAt: new Date('2026-08-31T01:00:01.000Z'),
  });
}
