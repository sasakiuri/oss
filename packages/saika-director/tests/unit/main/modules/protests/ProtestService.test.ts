// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { allMigrations } from '@/main/infrastructure/database/migrations';
import { MigrationRunner } from '@/main/infrastructure/database/migrations/MigrationRunner';
import { ProtestService, SqliteProtestRepository } from '@/main/modules/protests';
import type { CreateProtestPayload } from '@/shared/ipc/contracts';

const receipt: CreateProtestPayload = {
  scopeType: 'EVENT',
  scopeId: 'event-a',
  kind: 'WRITTEN',
  subject: 'Interruption',
  statement: 'Review requested',
  lodgedBy: 'Team official',
  lodgedAt: '2026-09-08T00:25:00.000Z',
  triggeringDecisionAt: '2026-09-08T00:00:00.000Z',
  feePaidEuro: null,
  formReference: null,
  openedBy: 'RO',
};

describe('Protest receipt and history', () => {
  let db: Database.Database;
  let service: ProtestService;
  beforeEach(() => {
    db = new Database(':memory:');
    new MigrationRunner(db).run(allMigrations);
    service = new ProtestService(new SqliteProtestRepository(db));
  });
  afterEach(() => db.close());

  it('preserves missing receipt facts while assessing them separately from acceptance', async () => {
    const created = await service.create(receipt);
    const read = await service.getById(created.id);
    expect(read).toMatchObject({
      feePaidEuro: null,
      formReference: null,
      lodgedAt: receipt.lodgedAt,
      status: 'OPEN',
      compliance: {
        withinDeadline: false,
        expectedFeeEuro: 50,
        issues: [
          'Record the Form P reference',
          'Expected fee is EUR 50',
          'The filing is outside 20 minutes; record the accepted exception or reject it',
        ],
      },
    });
    await expect(service.getById('missing')).rejects.toThrow('not found');
  });

  it('does not reopen a closed case when a historical action time precedes the decision', async () => {
    const created = await service.create(receipt);
    const action = {
      caseId: created.id,
      statement: 'Paper record',
      officialName: 'Jury',
      occurredAt: '2026-09-08T01:00:00.000Z',
    };
    await service.recordEntry({ ...action, type: 'DECIDED_REJECTED' });
    await service.recordEntry({ ...action, type: 'CLOSED', occurredAt: '2026-09-08T00:59:59.000Z' });
    const restored = new ProtestService(new SqliteProtestRepository(db));
    expect(await restored.getById(created.id)).toMatchObject({
      status: 'CLOSED',
      entries: [{ type: 'DECIDED_REJECTED' }, { type: 'CLOSED' }],
    });
    await expect(restored.recordEntry({ ...action, type: 'NOTE' })).rejects.toThrow('closed');
  });

  it('uses Form AP for appeals and refuses another appeal against the final appeal decision', async () => {
    const original = await service.create(receipt);
    const appeal = await service.create({ ...receipt, kind: 'APPEAL', parentProtestId: original.id });
    expect(appeal.compliance.issues).toContain('Record the Form AP reference');
    await expect(service.create({ ...receipt, kind: 'APPEAL', parentProtestId: appeal.id })).rejects.toThrow(
      'cannot be appealed',
    );
    await service.recordEntry({
      caseId: original.id,
      type: 'VOID',
      statement: 'Duplicate case',
      officialName: 'Jury',
      occurredAt: '2026-09-08T01:00:00.000Z',
    });
    await expect(service.create({ ...receipt, kind: 'APPEAL', parentProtestId: original.id })).rejects.toThrow('void');
  });
});
