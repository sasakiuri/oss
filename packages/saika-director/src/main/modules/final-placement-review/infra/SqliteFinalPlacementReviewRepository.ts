import type Database from 'better-sqlite3';

import type { IFinalPlacementReviewRepository } from '../domain/IFinalPlacementReviewRepository';
import {
  FinalPlacementReviewEntry,
  type FinalPlacementAssignment,
  type FinalPlacementReviewEntryType,
} from '../domain/FinalPlacementReviewEntry';

interface FinalPlacementReviewRow {
  id: string;
  event_id: string;
  entry_type: FinalPlacementReviewEntryType;
  scoring_revision: string;
  placements_json: string;
  rule_reference: string;
  statement: string;
  official_name: string;
  recorded_at: string;
  reverses_review_id: string | null;
}

export class SqliteFinalPlacementReviewRepository implements IFinalPlacementReviewRepository {
  constructor(private readonly db: Database.Database) {}

  append(entry: FinalPlacementReviewEntry): void {
    this.db
      .prepare(
        `INSERT INTO final_placement_review_entries (
           id, event_id, entry_type, scoring_revision, placements_json,
           rule_reference, statement, official_name, recorded_at, reverses_review_id
         ) VALUES (
           @id, @eventId, @type, @scoringRevision, @placementsJson,
           @ruleReference, @statement, @officialName, @recordedAt, @reversesReviewId
         )`,
      )
      .run({
        ...entry,
        placementsJson: JSON.stringify(entry.placements),
        recordedAt: entry.recordedAt.toISOString(),
      });
  }

  findById(id: string): FinalPlacementReviewEntry | null {
    const row = this.db.prepare('SELECT * FROM final_placement_review_entries WHERE id = ?').get(id) as
      FinalPlacementReviewRow | undefined;
    return row ? toEntry(row) : null;
  }

  findByEventId(eventId: string): FinalPlacementReviewEntry[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM final_placement_review_entries
         WHERE event_id = ?
         ORDER BY recorded_at, rowid`,
      )
      .all(eventId) as FinalPlacementReviewRow[];
    return rows.map(toEntry);
  }
}

function toEntry(row: FinalPlacementReviewRow): FinalPlacementReviewEntry {
  return FinalPlacementReviewEntry.reconstruct({
    id: row.id,
    eventId: row.event_id,
    type: row.entry_type,
    scoringRevision: row.scoring_revision,
    placements: parsePlacements(row.placements_json),
    ruleReference: row.rule_reference,
    statement: row.statement,
    officialName: row.official_name,
    recordedAt: new Date(row.recorded_at),
    reversesReviewId: row.reverses_review_id,
  });
}

function parsePlacements(value: string): FinalPlacementAssignment[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPlacement).map((placement) => ({ ...placement }));
  } catch {
    return [];
  }
}

function isPlacement(value: unknown): value is FinalPlacementAssignment {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.resultId === 'string' &&
    typeof candidate.participantId === 'string' &&
    typeof candidate.rank === 'number'
  );
}
