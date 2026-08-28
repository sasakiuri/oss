import type Database from 'better-sqlite3';
import type { IParticipantRepository } from '../domain/IParticipantRepository';
import { Participant } from '../domain/Participant';
import { ParticipantId } from '../domain/ParticipantId';
import { EventId } from '../domain/EventId';

interface ParticipantRow {
  id: string;
  event_id: string;
  player_name: string;
  family_name: string | null;
  affiliation: string;
  logo_path: string | null;
  sort_order: number;
}

export class SqliteParticipantRepository implements IParticipantRepository {
  constructor(private readonly db: Database.Database) {}

  save(participant: Participant): void {
    const stmt = this.db.prepare(`
      INSERT INTO participants (id, event_id, player_name, family_name, affiliation, logo_path, sort_order)
      VALUES (@id, @eventId, @playerName, @familyName, @affiliation, @logoPath, @sortOrder)
      ON CONFLICT(id) DO UPDATE SET
        event_id = excluded.event_id,
        player_name = excluded.player_name,
        family_name = excluded.family_name,
        affiliation = excluded.affiliation,
        logo_path = excluded.logo_path,
        sort_order = excluded.sort_order
    `);
    stmt.run({
      id: participant.id.value,
      eventId: participant.eventId.value,
      playerName: participant.playerName,
      familyName: participant.familyName,
      affiliation: participant.affiliation,
      logoPath: participant.logoPath,
      sortOrder: participant.sortOrder,
    });
  }

  saveAll(participants: Participant[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO participants (id, event_id, player_name, family_name, affiliation, logo_path, sort_order)
      VALUES (@id, @eventId, @playerName, @familyName, @affiliation, @logoPath, @sortOrder)
      ON CONFLICT(id) DO UPDATE SET
        event_id = excluded.event_id,
        player_name = excluded.player_name,
        family_name = excluded.family_name,
        affiliation = excluded.affiliation,
        logo_path = excluded.logo_path,
        sort_order = excluded.sort_order
    `);
    const transaction = this.db.transaction((items: Participant[]) => {
      for (const p of items) {
        stmt.run({
          id: p.id.value,
          eventId: p.eventId.value,
          playerName: p.playerName,
          familyName: p.familyName,
          affiliation: p.affiliation,
          logoPath: p.logoPath,
          sortOrder: p.sortOrder,
        });
      }
    });
    transaction(participants);
  }

  findById(id: string): Participant | null {
    const stmt = this.db.prepare('SELECT * FROM participants WHERE id = ?');
    const row = stmt.get(id) as ParticipantRow | undefined;
    if (!row) return null;
    return this.toEntity(row);
  }

  findByEventId(eventId: string): Participant[] {
    const stmt = this.db.prepare('SELECT * FROM participants WHERE event_id = ? ORDER BY sort_order');
    const rows = stmt.all(eventId) as ParticipantRow[];
    return rows.map((row) => this.toEntity(row));
  }

  deleteByEventId(eventId: string): void {
    const stmt = this.db.prepare('DELETE FROM participants WHERE event_id = ?');
    stmt.run(eventId);
  }

  delete(id: string): void {
    const stmt = this.db.prepare('DELETE FROM participants WHERE id = ?');
    stmt.run(id);
  }

  executeInTransaction(fn: () => void): void {
    const transaction = this.db.transaction(() => {
      fn();
    });
    transaction();
  }

  private toEntity(row: ParticipantRow): Participant {
    return Participant.reconstruct(
      ParticipantId.create(row.id),
      EventId.create(row.event_id),
      row.player_name,
      row.affiliation,
      row.logo_path,
      row.sort_order,
      row.family_name ?? row.player_name,
    );
  }
}
