import type Database from 'better-sqlite3';

import type {
  IOutdoorEliminationPlanRepository,
  OutdoorEliminationPlanEntryRecord,
  OutdoorEliminationPlanEntryType,
  OutdoorEliminationPlanRecord,
} from '../domain/IOutdoorEliminationPlanRepository';
import type { OutdoorEliminationPlan, OutdoorEliminationPlanInput } from '../domain/OutdoorEliminationPolicy';

interface PlanRow {
  id: string;
  event_id: string;
  competition_type_id: string;
  rule_pack_id: string;
  rule_pack_schema_version: 1;
  rule_pack_fingerprint_sha256: string;
  source_hash: string;
  input_json: string;
  projection_json: string;
  created_by: string;
  created_at: string;
}

interface EntryRow {
  id: string;
  plan_id: string;
  entry_type: OutdoorEliminationPlanEntryType;
  official_name: string;
  statement: string;
  recorded_at: string;
}

export class SqliteOutdoorEliminationPlanRepository implements IOutdoorEliminationPlanRepository {
  constructor(private readonly db: Database.Database) {}

  appendPlan(plan: Omit<OutdoorEliminationPlanRecord, 'entries'>): void {
    this.db
      .prepare(
        `INSERT INTO outdoor_elimination_plans (
          id, event_id, competition_type_id, rule_pack_id, rule_pack_schema_version,
          rule_pack_fingerprint_sha256, source_hash, input_json, projection_json, created_by, created_at
        ) VALUES (
          @id, @eventId, @competitionTypeId, @rulePackId, @rulePackSchemaVersion,
          @rulePackFingerprintSha256, @sourceHash, @inputJson, @projectionJson, @createdBy, @createdAt
        )`,
      )
      .run({
        id: plan.id,
        eventId: plan.eventId,
        competitionTypeId: plan.competitionTypeId,
        rulePackId: plan.rulePackIdentity.id,
        rulePackSchemaVersion: plan.rulePackIdentity.schemaVersion,
        rulePackFingerprintSha256: plan.rulePackIdentity.fingerprint.value,
        sourceHash: plan.sourceHash,
        inputJson: JSON.stringify(plan.input),
        projectionJson: JSON.stringify(plan.projection),
        createdBy: plan.createdBy,
        createdAt: plan.createdAt,
      });
  }

  appendEntry(entry: OutdoorEliminationPlanEntryRecord): void {
    this.db
      .prepare(
        `INSERT INTO outdoor_elimination_plan_entries (
          id, plan_id, entry_type, official_name, statement, recorded_at
        ) VALUES (@id, @planId, @entryType, @officialName, @statement, @recordedAt)`,
      )
      .run(entry);
  }

  findByEvent(eventId: string): OutdoorEliminationPlanRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM outdoor_elimination_plans WHERE event_id = ? ORDER BY created_at, rowid')
      .all(eventId) as PlanRow[];
    return rows.map((row) => this.toRecord(row));
  }

  findById(planId: string): OutdoorEliminationPlanRecord | null {
    const row = this.db.prepare('SELECT * FROM outdoor_elimination_plans WHERE id = ?').get(planId) as
      PlanRow | undefined;
    return row ? this.toRecord(row) : null;
  }

  private toRecord(row: PlanRow): OutdoorEliminationPlanRecord {
    const entries = this.db
      .prepare('SELECT * FROM outdoor_elimination_plan_entries WHERE plan_id = ? ORDER BY recorded_at, rowid')
      .all(row.id) as EntryRow[];
    return {
      id: row.id,
      eventId: row.event_id,
      competitionTypeId: row.competition_type_id,
      rulePackIdentity: {
        id: row.rule_pack_id,
        schemaVersion: row.rule_pack_schema_version,
        fingerprint: { algorithm: 'SHA-256', value: row.rule_pack_fingerprint_sha256 },
      },
      sourceHash: row.source_hash,
      input: JSON.parse(row.input_json) as OutdoorEliminationPlanInput,
      projection: JSON.parse(row.projection_json) as OutdoorEliminationPlan,
      createdBy: row.created_by,
      createdAt: row.created_at,
      entries: entries.map((entry) => ({
        id: entry.id,
        planId: entry.plan_id,
        entryType: entry.entry_type,
        officialName: entry.official_name,
        statement: entry.statement,
        recordedAt: entry.recorded_at,
      })),
    };
  }
}
