import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migration003CreateSchema } from '@/main/infrastructure/database/migrations/003_create_schema';
import { migration016FinalPlacementReviews } from '@/main/infrastructure/database/migrations/016_final_placement_reviews';
import {
  FinalPlacementReviewEntry,
  getCurrentFinalPlacementReview,
} from '@/main/modules/final-placement-review/domain/FinalPlacementReviewEntry';
import { SqliteFinalPlacementReviewRepository } from '@/main/modules/final-placement-review/infra/SqliteFinalPlacementReviewRepository';

const CHAMPIONSHIP_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';

describe('SqliteFinalPlacementReviewRepository', () => {
  let database: Database.Database;
  let repository: SqliteFinalPlacementReviewRepository;

  beforeEach(() => {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    migration003CreateSchema.up(database);
    migration016FinalPlacementReviews.up(database);
    database
      .prepare('INSERT INTO championships (id, name, date, venue) VALUES (?, ?, ?, ?)')
      .run(CHAMPIONSHIP_ID, 'Championship', '2026-08-29', 'Tokyo');
    database
      .prepare(
        `INSERT INTO events (id, championship_id, name, event_type, round, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(EVENT_ID, CHAMPIONSHIP_ID, 'Final', 'BR60S_FINAL', 'Final', 0);
    repository = new SqliteFinalPlacementReviewRepository(database);
  });

  afterEach(() => database.close());

  it('retains reviews and a linked revocation in deterministic append order', () => {
    const recordedAt = new Date('2026-08-29T00:00:00.000Z');
    const first = createReview(recordedAt, [
      { resultId: 'result-1', participantId: 'participant-1', rank: 1 },
      { resultId: 'result-2', participantId: 'participant-2', rank: 2 },
    ]);
    const amended = createReview(recordedAt, [
      { resultId: 'result-1', participantId: 'participant-1', rank: 2 },
      { resultId: 'result-2', participantId: 'participant-2', rank: 1 },
    ]);
    const revocation = FinalPlacementReviewEntry.createRevocation(amended, {
      ruleReference: '6.17',
      reason: 'Placement requires another Jury review',
      officialName: 'Final Jury Chair',
      recordedAt: new Date('2026-08-29T00:01:00.000Z'),
    });

    repository.append(first);
    repository.append(amended);
    repository.append(revocation);

    const history = repository.findByEventId(EVENT_ID);
    expect(history).toEqual([first, amended, revocation]);
    expect(repository.findById(amended.id)).toEqual(amended);
    expect(getCurrentFinalPlacementReview(history)).toBeNull();
    expect(database.prepare('SELECT COUNT(*) AS count FROM final_placement_review_entries').get()).toEqual({
      count: 3,
    });
  });

  it('prevents event deletion from orphaning a Final placement audit trail', () => {
    repository.append(
      createReview(new Date('2026-08-29T00:00:00.000Z'), [
        { resultId: 'result-1', participantId: 'participant-1', rank: 1 },
      ]),
    );

    expect(() => database.prepare('DELETE FROM events WHERE id = ?').run(EVENT_ID)).toThrow();
  });

  it('rejects duplicate ranks before persistence', () => {
    expect(() =>
      createReview(new Date('2026-08-29T00:00:00.000Z'), [
        { resultId: 'result-1', participantId: 'participant-1', rank: 1 },
        { resultId: 'result-2', participantId: 'participant-2', rank: 1 },
      ]),
    ).toThrow('Final placement ranks must be unique');
  });
});

function createReview(
  recordedAt: Date,
  placements: Array<{ resultId: string; participantId: string; rank: number }>,
): FinalPlacementReviewEntry {
  return FinalPlacementReviewEntry.createReview({
    eventId: EVENT_ID,
    scoringRevision: 'a'.repeat(64),
    placements,
    ruleReference: '6.17',
    statement: 'Final placements reviewed against elimination and shoot-off history',
    officialName: 'Final Jury Chair',
    recordedAt,
  });
}
