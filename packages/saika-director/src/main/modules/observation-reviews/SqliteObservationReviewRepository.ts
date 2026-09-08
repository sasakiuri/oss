import type Database from 'better-sqlite3';
import type { IObservationReviewRepository, ObservationReview } from './ObservationReviewService';

export class SqliteObservationReviewRepository implements IObservationReviewRepository {
  constructor(private readonly db: Database.Database) {}
  transaction<T>(work: () => T): T {
    return this.db.transaction(work)();
  }
  list(competitionId: string): ObservationReview[] {
    return (
      this.db
        .prepare('SELECT snapshot_json FROM observation_reviews WHERE competition_id = ? ORDER BY rowid')
        .all(competitionId) as { snapshot_json: string }[]
    ).map((row) => JSON.parse(row.snapshot_json) as ObservationReview);
  }
  append(review: ObservationReview): void {
    this.db
      .prepare('INSERT INTO observation_reviews (id, competition_id, subject_id, snapshot_json) VALUES (?, ?, ?, ?)')
      .run(review.id, review.competitionId, review.subjectId, JSON.stringify(review));
  }
}
