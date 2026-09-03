import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { migration020RangeInterruptions } from '@/main/infrastructure/database/migrations/020_range_interruptions';
import { migration053QualificationTimedTargetInterruptions } from '@/main/infrastructure/database/migrations/053_qualification_timed_target_interruptions';

describe('migration053QualificationTimedTargetInterruptions', () => {
  let database: Database.Database | undefined;

  afterEach(() => database?.close());

  it('adds the immutable policy-context column idempotently', () => {
    database = new Database(':memory:');
    migration020RangeInterruptions.up(database);

    migration053QualificationTimedTargetInterruptions.up(database);
    migration053QualificationTimedTargetInterruptions.up(database);

    const columns = database.prepare('PRAGMA table_info(range_interruption_cases)').all() as { name: string }[];
    expect(columns.map((column) => column.name)).toContain('qualification_timed_target_context_json');
  });
});
