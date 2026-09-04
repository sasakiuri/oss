import type Database from 'better-sqlite3';

import type { IPostCompetitionEquipmentCheckRepository } from '../domain/IPostCompetitionEquipmentCheckRepository';
import {
  createEquipmentControlEntry,
  PostCompetitionEquipmentCheck,
  type EquipmentControlEntry,
  type EquipmentControlSelectionBasis,
} from '../domain/PostCompetitionEquipmentCheck';

interface CheckRow {
  id: string;
  championship_id: string;
  event_id: string;
  event_name: string;
  event_type: string;
  round_name: string;
  participant_id: string;
  athlete_name: string;
  start_number: string | null;
  gender: string;
  selection_basis: EquipmentControlSelectionBasis;
  selection_statement: string;
  selected_by: string;
  selected_at: string;
  recorded_at: string;
  rule_references_json: string;
}

interface EntryRow {
  id: string;
  check_id: string;
  entry_type: EquipmentControlEntry['type'];
  payload_json: string;
  occurred_at: string;
  recorded_at: string;
}

export class SqlitePostCompetitionEquipmentCheckRepository implements IPostCompetitionEquipmentCheckRepository {
  constructor(private readonly database: Database.Database) {}

  appendChecks(checks: readonly PostCompetitionEquipmentCheck[]): void {
    const insert = this.database.prepare(
      `INSERT INTO post_competition_equipment_checks (
        id, championship_id, event_id, event_name, event_type, round_name,
        participant_id, athlete_name, start_number, gender, selection_basis,
        selection_statement, selected_by, selected_at, recorded_at, rule_references_json
      ) VALUES (
        @id, @championshipId, @eventId, @eventName, @eventType, @round,
        @participantId, @athleteName, @startNumber, @gender, @selectionBasis,
        @selectionStatement, @selectedBy, @selectedAt, @recordedAt, @ruleReferencesJson
      )`,
    );
    this.database.transaction((values: readonly PostCompetitionEquipmentCheck[]) => {
      for (const check of values) {
        insert.run({
          ...check,
          selectedAt: check.selectedAt.toISOString(),
          recordedAt: check.recordedAt.toISOString(),
          ruleReferencesJson: JSON.stringify(check.ruleReferences),
        });
      }
    })(checks);
  }

  appendEntry(entry: EquipmentControlEntry): void {
    this.database
      .prepare(
        `INSERT INTO post_competition_equipment_check_entries (
          id, check_id, entry_type, payload_json, occurred_at, recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.id,
        entry.checkId,
        entry.type,
        JSON.stringify(entryPayload(entry)),
        entry.occurredAt.toISOString(),
        entry.recordedAt.toISOString(),
      );
  }

  findById(checkId: string): PostCompetitionEquipmentCheck | null {
    const row = this.database.prepare('SELECT * FROM post_competition_equipment_checks WHERE id = ?').get(checkId) as
      CheckRow | undefined;
    return row ? toCheck(row) : null;
  }

  findByChampionship(championshipId: string): PostCompetitionEquipmentCheck[] {
    return (
      this.database
        .prepare(
          `SELECT * FROM post_competition_equipment_checks
            WHERE championship_id = ? ORDER BY selected_at, recorded_at, id`,
        )
        .all(championshipId) as CheckRow[]
    ).map(toCheck);
  }

  findEntries(checkId: string): EquipmentControlEntry[] {
    return (
      this.database
        .prepare(
          `SELECT * FROM post_competition_equipment_check_entries
            WHERE check_id = ? ORDER BY occurred_at, recorded_at, rowid`,
        )
        .all(checkId) as EntryRow[]
    ).map(toEntry);
  }
}

function toCheck(row: CheckRow): PostCompetitionEquipmentCheck {
  return PostCompetitionEquipmentCheck.reconstruct({
    id: row.id,
    championshipId: row.championship_id,
    eventId: row.event_id,
    eventName: row.event_name,
    eventType: row.event_type,
    round: row.round_name,
    participantId: row.participant_id,
    athleteName: row.athlete_name,
    startNumber: row.start_number,
    gender: row.gender,
    selectionBasis: row.selection_basis,
    selectionStatement: row.selection_statement,
    selectedBy: row.selected_by,
    selectedAt: new Date(row.selected_at),
    recordedAt: new Date(row.recorded_at),
    ruleReferences: JSON.parse(row.rule_references_json) as string[],
  });
}

function toEntry(row: EntryRow): EquipmentControlEntry {
  const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
  return createEquipmentControlEntry({
    ...payload,
    id: row.id,
    checkId: row.check_id,
    type: row.entry_type,
    occurredAt: new Date(row.occurred_at),
    recordedAt: new Date(row.recorded_at),
  } as Parameters<typeof createEquipmentControlEntry>[0]);
}

function entryPayload(entry: EquipmentControlEntry): Record<string, unknown> {
  const { id: _id, checkId: _checkId, occurredAt: _occurredAt, recordedAt: _recordedAt, ...payload } = entry;
  return payload;
}
