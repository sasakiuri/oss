import { describe, expect, it } from 'vitest';
import { SqliteEvidenceFileRepository } from '@/main/modules/evidence-files/infra/SqliteEvidenceFileRepository';
import { TargetExaminationCase } from '@/main/modules/target-examinations/domain/TargetExaminationCase';
import { TargetExaminationEvidence } from '@/main/modules/target-examinations/domain/TargetExaminationEvidence';
import { TargetExaminationScopeLink } from '@/main/modules/target-examinations/domain/TargetExaminationScopeLink';
import { SqliteTargetExaminationRepository } from '@/main/modules/target-examinations/infra/SqliteTargetExaminationRepository';

import { migratedDatabase } from '../../../../helpers/database';

describe('Evidence file metadata persistence', () => {
  it('preserves custody on restart, forbids destructive edits and enforces the evidence relationship', () => {
    const db = migratedDatabase();
    try {
      db.pragma('foreign_keys = ON');
      const examinations = new SqliteTargetExaminationRepository(db);
      const examination = TargetExaminationCase.create({
        issueKind: 'NO_SHOT_INDICATION',
        occurredAt: new Date('2026-09-07T00:00:00.000Z'),
        summary: 'Expected shot was not shown',
        details: 'The EST monitor did not change after the athlete reported firing.',
        ruleReferences: 'ISSF 6.10.8',
        openedBy: 'Jury',
      });
      const evidence = TargetExaminationEvidence.create({
        caseId: examination.id,
        type: 'EST_LOG_PRINT',
        description: 'Original log',
        collectedBy: 'Jury',
        collectedAt: new Date('2026-09-07T00:00:00.000Z'),
      });
      examinations.appendCase(examination, [
        TargetExaminationScopeLink.create({
          caseId: examination.id,
          scopeType: 'COMPETITION',
          scopeId: 'competition',
          linkedBy: 'Jury',
        }),
      ]);
      examinations.appendEvidence(evidence);
      const repository = new SqliteEvidenceFileRepository(db);
      const file = {
        id: 'file',
        caseId: examination.id,
        evidenceId: evidence.id,
        fileName: 'original.pdf',
        sha256: 'a'.repeat(64),
        sizeBytes: 10,
        importedBy: 'Jury',
        importedAt: '2026-09-07T00:00:00.000Z',
        statement: 'Original log',
      };
      repository.append(file);
      repository.append(file);
      expect(new SqliteEvidenceFileRepository(db).list(evidence.id)).toEqual([file]);
      expect(() => repository.append({ ...file, fileName: 'other' })).toThrow('already bound');
      expect(() => repository.append({ ...file, id: 'other', evidenceId: 'absent' })).toThrow('FOREIGN KEY');
      expect(() => db.prepare('DELETE FROM evidence_files').run()).toThrow('append-only');
      expect(() => db.prepare("UPDATE evidence_files SET snapshot_json = '{}' ").run()).toThrow('append-only');
    } finally {
      db.close();
    }
  });
});
