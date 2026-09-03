import type Database from 'better-sqlite3';

import type { IRelayReadinessRepository, RelayReadinessScope } from '../domain/IRelayReadinessRepository';
import {
  RelayReadinessEntry,
  type RelayReadinessPhase,
  type RelayReadinessRequirement,
  type RelayReadinessSource,
  type RelayReadinessState,
} from '../domain/RelayReadinessEntry';

interface Row {
  id: string;
  competition_id: string;
  relay_number: number;
  lane_id: string | null;
  phase: RelayReadinessPhase;
  requirement: RelayReadinessRequirement;
  state: RelayReadinessState;
  source: RelayReadinessSource;
  statement: string;
  official_name: string;
  recorded_at: string;
}

export class SqliteRelayReadinessRepository implements IRelayReadinessRepository {
  constructor(private readonly db: Database.Database) {}

  append(entry: RelayReadinessEntry): void {
    this.db
      .prepare(
        `INSERT INTO relay_readiness_entries (
         id, competition_id, relay_number, lane_id, phase, requirement,
         state, source, statement, official_name, recorded_at
       ) VALUES (
         @id, @competitionId, @relayNumber, @laneId, @phase, @requirement,
         @state, @source, @statement, @officialName, @recordedAt
       )`,
      )
      .run({ ...entry, recordedAt: entry.recordedAt.toISOString() });
  }

  findByScope(scope: RelayReadinessScope): RelayReadinessEntry[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM relay_readiness_entries
       WHERE competition_id = @competitionId
         AND relay_number = @relayNumber
         AND phase = @phase
       ORDER BY recorded_at, rowid`,
      )
      .all(scope) as Row[];
    return rows.map(toEntry);
  }

  findByRelay(scope: Omit<RelayReadinessScope, 'phase'>): RelayReadinessEntry[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM relay_readiness_entries
       WHERE competition_id = @competitionId
         AND relay_number = @relayNumber
       ORDER BY recorded_at, rowid`,
      )
      .all(scope) as Row[];
    return rows.map(toEntry);
  }
}

function toEntry(row: Row): RelayReadinessEntry {
  return RelayReadinessEntry.reconstruct({
    id: row.id,
    competitionId: row.competition_id,
    relayNumber: row.relay_number,
    laneId: row.lane_id,
    phase: row.phase,
    requirement: row.requirement,
    state: row.state,
    source: row.source,
    statement: row.statement,
    officialName: row.official_name,
    recordedAt: new Date(row.recorded_at),
  });
}
