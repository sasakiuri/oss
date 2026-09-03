import type Database from 'better-sqlite3';
import type { IEventRepository } from '../domain/IEventRepository';
import { Event } from '../domain/Event';
import { EventId } from '../domain/EventId';
import { ChampionshipId } from '../domain/ChampionshipId';
import { EventType } from '../domain/EventType';
import { Round } from '@/main/modules/lane-control';
import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';
import type { RulePackIdentity } from '@sasakiuri/saika-rules';

interface EventRow {
  id: string;
  championship_id: string;
  name: string;
  event_type: string;
  round: string;
  sort_order: number;
  rule_pack_id?: string | null;
  rule_pack_schema_version?: number | null;
  rule_pack_fingerprint_sha256?: string | null;
}

export class SqliteEventRepository implements IEventRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly registry: CompetitionTypeRegistry,
  ) {}

  save(event: Event): void {
    const stmt = this.db.prepare(`
      INSERT INTO events (
        id, championship_id, name, event_type, round, sort_order,
        rule_pack_id, rule_pack_schema_version, rule_pack_fingerprint_sha256
      )
      VALUES (
        @id, @championshipId, @name, @eventType, @round, @sortOrder,
        @rulePackId, @rulePackSchemaVersion, @rulePackFingerprintSha256
      )
      ON CONFLICT(id) DO UPDATE SET
        championship_id = excluded.championship_id,
        name = excluded.name,
        event_type = excluded.event_type,
        round = excluded.round,
        sort_order = excluded.sort_order,
        rule_pack_id = excluded.rule_pack_id,
        rule_pack_schema_version = excluded.rule_pack_schema_version,
        rule_pack_fingerprint_sha256 = excluded.rule_pack_fingerprint_sha256
    `);
    stmt.run({
      id: event.id.value,
      championshipId: event.championshipId.value,
      name: event.name,
      eventType: event.eventType.value,
      round: event.round.value,
      sortOrder: event.sortOrder,
      ...toBindingParams(event.rulePackIdentity),
    });
  }

  update(event: Event): void {
    const stmt = this.db.prepare(`
      UPDATE events
      SET name = @name, event_type = @eventType, round = @round, sort_order = @sortOrder,
          rule_pack_id = @rulePackId,
          rule_pack_schema_version = @rulePackSchemaVersion,
          rule_pack_fingerprint_sha256 = @rulePackFingerprintSha256
      WHERE id = @id
    `);
    stmt.run({
      id: event.id.value,
      name: event.name,
      eventType: event.eventType.value,
      round: event.round.value,
      sortOrder: event.sortOrder,
      ...toBindingParams(event.rulePackIdentity),
    });
  }

  findById(id: string): Event | null {
    const stmt = this.db.prepare('SELECT * FROM events WHERE id = ?');
    const row = stmt.get(id) as EventRow | undefined;
    if (!row) return null;
    return this.toEntity(row);
  }

  findByChampionshipId(championshipId: string): Event[] {
    const stmt = this.db.prepare('SELECT * FROM events WHERE championship_id = ? ORDER BY sort_order');
    const rows = stmt.all(championshipId) as EventRow[];
    return rows.map((row) => this.toEntity(row));
  }

  delete(id: string): void {
    const stmt = this.db.prepare('DELETE FROM events WHERE id = ?');
    stmt.run(id);
  }

  deleteByChampionshipId(championshipId: string): void {
    const stmt = this.db.prepare('DELETE FROM events WHERE championship_id = ?');
    stmt.run(championshipId);
  }

  executeInTransaction(fn: () => void): void {
    const transaction = this.db.transaction(() => {
      fn();
    });
    transaction();
  }

  private toEntity(row: EventRow): Event {
    return Event.reconstruct(
      EventId.create(row.id),
      ChampionshipId.create(row.championship_id),
      row.name,
      EventType.create(row.event_type, this.registry),
      Round.create(row.round),
      row.sort_order,
      toRulePackIdentity(row),
    );
  }
}

function toBindingParams(identity: RulePackIdentity | null): {
  rulePackId: string | null;
  rulePackSchemaVersion: number | null;
  rulePackFingerprintSha256: string | null;
} {
  return {
    rulePackId: identity?.id ?? null,
    rulePackSchemaVersion: identity?.schemaVersion ?? null,
    rulePackFingerprintSha256: identity?.fingerprint.value ?? null,
  };
}

function toRulePackIdentity(row: EventRow): RulePackIdentity | null {
  if (!row.rule_pack_id && row.rule_pack_schema_version == null && !row.rule_pack_fingerprint_sha256) return null;
  if (!row.rule_pack_id || row.rule_pack_schema_version !== 1 || !row.rule_pack_fingerprint_sha256) {
    throw new Error(`Event ${row.id} has an incomplete Rule Pack binding`);
  }
  return {
    id: row.rule_pack_id,
    schemaVersion: 1,
    fingerprint: { algorithm: 'SHA-256', value: row.rule_pack_fingerprint_sha256 },
  };
}
