import type Database from 'better-sqlite3';
import {
  publicationReviewPolicyEntrySchema,
  type PublicationReviewPolicyEntry,
} from '@/shared/ipc/contracts/publicationReviewPolicy.contract';
import type { IPublicationReviewPolicyRepository } from './PublicationReviewPolicyService';

export class SqlitePublicationReviewPolicyRepository implements IPublicationReviewPolicyRepository {
  constructor(private readonly db: Database.Database) {}
  find(eventId: string, scope: 'QUALIFICATION' | 'FINAL'): PublicationReviewPolicyEntry[] {
    return (
      this.db
        .prepare(
          'SELECT payload_json FROM publication_review_policies WHERE event_id = ? AND result_scope = ? ORDER BY rowid',
        )
        .all(eventId, scope) as { payload_json: string }[]
    ).map((row) => publicationReviewPolicyEntrySchema.parse(JSON.parse(row.payload_json)));
  }
  append(entry: PublicationReviewPolicyEntry, expectedPreviousId: string | null): void {
    this.db.transaction(() => {
      if ((this.find(entry.eventId, entry.resultScope).at(-1)?.id ?? null) !== expectedPreviousId)
        throw new Error('The event policy changed; reload before saving');
      const parsed = publicationReviewPolicyEntrySchema.parse(entry);
      this.db
        .prepare(
          'INSERT INTO publication_review_policies (id, event_id, result_scope, payload_json) VALUES (?, ?, ?, ?)',
        )
        .run(parsed.id, parsed.eventId, parsed.resultScope, JSON.stringify(parsed));
    })();
  }
}
