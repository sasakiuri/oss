import type Database from 'better-sqlite3';
import type {
  IProductionOperationRepository,
  ProductionOperationAction,
  ProductionOperationEntry,
} from '../domain/IProductionOperationRepository';

interface Row {
  id: string;
  competition_id: string;
  competition_type_id: string;
  round_name: string;
  phase: string;
  action: ProductionOperationAction;
  statement: string;
  official_name: string;
  recorded_at: string;
}

export class SqliteProductionOperationRepository implements IProductionOperationRepository {
  constructor(private readonly db: Database.Database) {}

  append(entry: ProductionOperationEntry): void {
    this.db
      .prepare(
        `INSERT INTO production_operation_entries (
      id, competition_id, competition_type_id, round_name, phase, action, statement, official_name, recorded_at
    ) VALUES (
      @id, @competitionId, @competitionTypeId, @roundName, @phase, @action, @statement, @officialName, @recordedAt
    )`,
      )
      .run(entry);
  }

  findByCompetition(competitionId: string): ProductionOperationEntry[] {
    return (
      this.db
        .prepare('SELECT * FROM production_operation_entries WHERE competition_id = ? ORDER BY recorded_at, rowid')
        .all(competitionId) as Row[]
    ).map((row) => ({
      id: row.id,
      competitionId: row.competition_id,
      competitionTypeId: row.competition_type_id,
      roundName: row.round_name,
      phase: row.phase,
      action: row.action,
      statement: row.statement,
      officialName: row.official_name,
      recordedAt: row.recorded_at,
    }));
  }
}
