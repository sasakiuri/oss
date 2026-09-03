import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { migration020RangeInterruptions } from '@/main/infrastructure/database/migrations/020_range_interruptions';
import { migration054QualificationTimedTargetRecoveryDecisions } from '@/main/infrastructure/database/migrations/054_qualification_timed_target_recovery_decisions';

describe('migration054QualificationTimedTargetRecoveryDecisions', () => {
  let database: Database.Database | undefined;

  afterEach(() => database?.close());

  it('creates an append-only official decision ledger idempotently', () => {
    database = new Database(':memory:');
    migration020RangeInterruptions.up(database);

    migration054QualificationTimedTargetRecoveryDecisions.up(database);
    migration054QualificationTimedTargetRecoveryDecisions.up(database);

    const table = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get('qualification_timed_target_recovery_decisions') as { name: string } | undefined;
    expect(table?.name).toBe('qualification_timed_target_recovery_decisions');
  });
});
