import type Database from 'better-sqlite3';

import type {
  FinalOperationEntry,
  FinalOperationEntryType,
  FinalOperationExecutionStatus,
  FinalOperationRun,
  FinalOperationShootOffShot,
  IFinalOperationRepository,
} from '../domain/IFinalOperationRepository';

interface RunRow {
  id: string;
  competition_id: string;
  event_id: string | null;
  competition_type_id: string;
  rule_pack_id: string;
  script_version: string;
  script_snapshot_json: string;
  scheduled_start_at: string;
  created_by: string;
  created_at: string;
}

interface EntryRow {
  id: string;
  run_id: string;
  entry_type: FinalOperationEntryType;
  branch: 'MAIN' | 'SHOOT_OFF';
  iteration: number;
  step_id: string | null;
  step_snapshot_json: string | null;
  confirmation_entry_id: string | null;
  execution_status: FinalOperationExecutionStatus | null;
  command_id: string | null;
  eligible_lane_ids_json: string;
  statement: string;
  official_name: string;
  recorded_at: string;
  metadata_json: string | null;
}

interface ShootOffShotRow {
  id: string;
  run_id: string;
  iteration: number;
  lane_id: string;
  shot_id: string;
  score_x10: number;
  x: number | null;
  y: number | null;
  fired_at: string;
  observed_at: string;
}

export class SqliteFinalOperationRepository implements IFinalOperationRepository {
  constructor(private readonly db: Database.Database) {}

  insertRun(run: FinalOperationRun): void {
    this.db
      .prepare(
        `INSERT INTO final_operation_runs (
          id, competition_id, event_id, competition_type_id, rule_pack_id, script_version,
          script_snapshot_json, scheduled_start_at, created_by, created_at
        ) VALUES (
          @id, @competitionId, @eventId, @competitionTypeId, @rulePackId, @scriptVersion,
          @scriptSnapshotJson, @scheduledStartAt, @createdBy, @createdAt
        )`,
      )
      .run({ ...run, scriptSnapshotJson: JSON.stringify(run.script) });
  }

  appendEntry(entry: FinalOperationEntry): void {
    this.db
      .prepare(
        `INSERT INTO final_operation_entries (
          id, run_id, entry_type, branch, iteration, step_id, step_snapshot_json,
          confirmation_entry_id, execution_status, command_id, eligible_lane_ids_json,
          statement, official_name, recorded_at, metadata_json
        ) VALUES (
          @id, @runId, @entryType, @branch, @iteration, @stepId, @stepSnapshotJson,
          @confirmationEntryId, @executionStatus, @commandId, @eligibleLaneIdsJson,
          @statement, @officialName, @recordedAt, @metadataJson
        )`,
      )
      .run({
        ...entry,
        stepSnapshotJson: entry.stepSnapshot ? JSON.stringify(entry.stepSnapshot) : null,
        eligibleLaneIdsJson: JSON.stringify(entry.eligibleLaneIds),
        metadataJson: entry.metadata ? JSON.stringify(entry.metadata) : null,
      });
  }

  findRunById(id: string): FinalOperationRun | null {
    const row = this.db.prepare('SELECT * FROM final_operation_runs WHERE id = ?').get(id) as RunRow | undefined;
    return row ? toRun(row) : null;
  }

  findLatestRunByCompetition(competitionId: string): FinalOperationRun | null {
    const row = this.db
      .prepare(
        'SELECT * FROM final_operation_runs WHERE competition_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
      )
      .get(competitionId) as RunRow | undefined;
    return row ? toRun(row) : null;
  }

  findEntriesByRun(runId: string): FinalOperationEntry[] {
    return (
      this.db
        .prepare('SELECT * FROM final_operation_entries WHERE run_id = ? ORDER BY recorded_at, rowid')
        .all(runId) as EntryRow[]
    ).map(toEntry);
  }

  appendShootOffShot(shot: FinalOperationShootOffShot): void {
    this.db
      .prepare(
        `INSERT INTO final_operation_shoot_off_shots (
          id, run_id, iteration, lane_id, shot_id, score_x10, x, y, fired_at, observed_at
        ) VALUES (
          @id, @runId, @iteration, @laneId, @shotId, @scoreX10, @x, @y, @firedAt, @observedAt
        )`,
      )
      .run(shot);
  }

  findShootOffShotsByRun(runId: string): FinalOperationShootOffShot[] {
    return (
      this.db
        .prepare(
          `SELECT * FROM final_operation_shoot_off_shots
           WHERE run_id = ? ORDER BY iteration, observed_at, rowid`,
        )
        .all(runId) as ShootOffShotRow[]
    ).map(toShootOffShot);
  }
}

function toRun(row: RunRow): FinalOperationRun {
  return {
    id: row.id,
    competitionId: row.competition_id,
    eventId: row.event_id,
    competitionTypeId: row.competition_type_id,
    rulePackId: row.rule_pack_id,
    scriptVersion: row.script_version,
    script: JSON.parse(row.script_snapshot_json) as FinalOperationRun['script'],
    scheduledStartAt: row.scheduled_start_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function toEntry(row: EntryRow): FinalOperationEntry {
  return {
    id: row.id,
    runId: row.run_id,
    entryType: row.entry_type,
    branch: row.branch,
    iteration: row.iteration,
    stepId: row.step_id,
    stepSnapshot: row.step_snapshot_json
      ? (JSON.parse(row.step_snapshot_json) as NonNullable<FinalOperationEntry['stepSnapshot']>)
      : null,
    confirmationEntryId: row.confirmation_entry_id,
    executionStatus: row.execution_status,
    commandId: row.command_id,
    eligibleLaneIds: JSON.parse(row.eligible_lane_ids_json) as string[],
    statement: row.statement,
    officialName: row.official_name,
    recordedAt: row.recorded_at,
    metadata: row.metadata_json ? (JSON.parse(row.metadata_json) as Record<string, unknown>) : null,
  };
}

function toShootOffShot(row: ShootOffShotRow): FinalOperationShootOffShot {
  return {
    id: row.id,
    runId: row.run_id,
    iteration: row.iteration,
    laneId: row.lane_id,
    shotId: row.shot_id,
    scoreX10: row.score_x10,
    x: row.x,
    y: row.y,
    firedAt: row.fired_at,
    observedAt: row.observed_at,
  };
}
