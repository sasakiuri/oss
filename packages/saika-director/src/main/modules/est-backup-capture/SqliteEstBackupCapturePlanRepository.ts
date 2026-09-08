import type Database from 'better-sqlite3';
import { z } from 'zod';

import type { EstBackupCapturePlan, IEstBackupCapturePlanRepository } from './EstBackupCapturePersistence';

const reference = z.object({ adapter: z.string().min(1), options: z.record(z.string(), z.unknown()) });
const planSchema = z.object({
  eventId: z.string().uuid(),
  sourceLabel: z.string().min(1),
  feed: reference,
  parser: reference.nullable(),
  intervalMilliseconds: z.number().int().min(1000).max(300_000),
  snapshotMode: z.enum(['STABLE_READS', 'COMPLETE_FILES']),
  resumeOnStartup: z.boolean(),
  enabled: z.boolean(),
});

/** Configuration is mutable; retained source evidence has its own append-only repository. */
export class SqliteEstBackupCapturePlanRepository implements IEstBackupCapturePlanRepository {
  constructor(private readonly db: Database.Database) {}
  find(eventId: string): EstBackupCapturePlan | null {
    const row = this.db
      .prepare('SELECT event_id, plan_json FROM est_backup_capture_plans WHERE event_id = ?')
      .get(eventId) as { event_id: string; plan_json: string } | undefined;
    return row ? this.decode(row) : null;
  }
  list(): EstBackupCapturePlan[] {
    const rows = this.db.prepare('SELECT event_id, plan_json FROM est_backup_capture_plans').all() as {
      event_id: string;
      plan_json: string;
    }[];
    return rows.map((row) => this.decode(row));
  }
  save(plan: EstBackupCapturePlan): void {
    const validated = planSchema.parse(plan);
    this.db
      .prepare(
        `INSERT INTO est_backup_capture_plans (event_id, plan_json) VALUES (?, ?)
      ON CONFLICT(event_id) DO UPDATE SET plan_json = excluded.plan_json`,
      )
      .run(validated.eventId, JSON.stringify(validated));
  }
  remove(eventId: string): void {
    this.db.prepare('DELETE FROM est_backup_capture_plans WHERE event_id = ?').run(eventId);
  }
  private decode(row: { event_id: string; plan_json: string }): EstBackupCapturePlan {
    const plan = planSchema.parse(JSON.parse(row.plan_json));
    if (plan.eventId !== row.event_id) throw new Error('The saved backup capture identity does not match');
    return plan;
  }
}
