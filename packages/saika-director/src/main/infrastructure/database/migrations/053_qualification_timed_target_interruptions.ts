import type { Migration } from './Migration';

/** Stores the Rule Pack and Lane facts captured for an ISSF 8.8.1 recommendation. */
export const migration053QualificationTimedTargetInterruptions: Migration = {
  version: 53,
  name: 'qualification_timed_target_interruptions',
  up(db) {
    const columns = db.prepare('PRAGMA table_info(range_interruption_cases)').all() as { name: string }[];
    if (!columns.some((column) => column.name === 'qualification_timed_target_context_json')) {
      db.exec('ALTER TABLE range_interruption_cases ADD COLUMN qualification_timed_target_context_json TEXT');
    }
  },
};
