import type Database from 'better-sqlite3';

import type {
  IRelayAthleteLifecycleRepository,
  RelayAthleteLifecycleScope,
} from '../domain/IRelayAthleteLifecycleRepository';
import {
  RelayAthleteLifecycleEntry,
  type RelayAthleteLifecyclePhase,
  type RelayAthleteLifecycleRequirement,
  type RelayAthleteLifecycleSource,
  type RelayAthleteLifecycleState,
} from '../domain/RelayAthleteLifecycleEntry';

interface Row {
  id: string;
  competition_id: string;
  relay_number: number;
  lane_id: string;
  athlete_id: string;
  athlete_name: string;
  athlete_start_number: number;
  phase: RelayAthleteLifecyclePhase;
  requirement: RelayAthleteLifecycleRequirement;
  state: RelayAthleteLifecycleState;
  source: RelayAthleteLifecycleSource;
  statement: string;
  official_name: string;
  recorded_at: string;
}

export class SqliteRelayAthleteLifecycleRepository implements IRelayAthleteLifecycleRepository {
  constructor(private readonly db: Database.Database) {}

  append(entry: RelayAthleteLifecycleEntry): void {
    this.db
      .prepare(
        `INSERT INTO relay_athlete_lifecycle_entries (
          id, competition_id, relay_number, lane_id, athlete_id, athlete_name,
          athlete_start_number, phase, requirement, state, source, statement,
          official_name, recorded_at
        ) VALUES (
          @id, @competitionId, @relayNumber, @laneId, @athleteId, @athleteName,
          @athleteStartNumber, @phase, @requirement, @state, @source, @statement,
          @officialName, @recordedAt
        )`,
      )
      .run({ ...entry, recordedAt: entry.recordedAt.toISOString() });
  }

  findByScope(scope: RelayAthleteLifecycleScope): RelayAthleteLifecycleEntry[] {
    return this.rows(
      `SELECT * FROM relay_athlete_lifecycle_entries
       WHERE competition_id = @competitionId AND relay_number = @relayNumber AND phase = @phase
       ORDER BY recorded_at, rowid`,
      scope,
    );
  }

  findByRelay(scope: Omit<RelayAthleteLifecycleScope, 'phase'>): RelayAthleteLifecycleEntry[] {
    return this.rows(
      `SELECT * FROM relay_athlete_lifecycle_entries
       WHERE competition_id = @competitionId AND relay_number = @relayNumber
       ORDER BY recorded_at, rowid`,
      scope,
    );
  }

  private rows(sql: string, parameters: object): RelayAthleteLifecycleEntry[] {
    return (this.db.prepare(sql).all(parameters) as Row[]).map((row) =>
      RelayAthleteLifecycleEntry.reconstruct({
        id: row.id,
        competitionId: row.competition_id,
        relayNumber: row.relay_number,
        laneId: row.lane_id,
        athleteId: row.athlete_id,
        athleteName: row.athlete_name,
        athleteStartNumber: row.athlete_start_number,
        phase: row.phase,
        requirement: row.requirement,
        state: row.state,
        source: row.source,
        statement: row.statement,
        officialName: row.official_name,
        recordedAt: new Date(row.recorded_at),
      }),
    );
  }
}
