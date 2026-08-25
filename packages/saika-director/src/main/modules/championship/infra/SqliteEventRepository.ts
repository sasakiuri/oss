import type Database from 'better-sqlite3';
import type { IEventRepository } from '../domain/IEventRepository';
import { Event } from '../domain/Event';
import { EventId } from '../domain/EventId';
import { ChampionshipId } from '../domain/ChampionshipId';
import { EventType } from '../domain/EventType';
import { Round } from '@/main/modules/lane-control';
import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';

interface EventRow {
  id: string;
  championship_id: string;
  name: string;
  event_type: string;
  round: string;
  sort_order: number;
}

export class SqliteEventRepository implements IEventRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly registry: CompetitionTypeRegistry,
  ) {}

  save(event: Event): void {
    const stmt = this.db.prepare(`
      INSERT INTO events (id, championship_id, name, event_type, round, sort_order)
      VALUES (@id, @championshipId, @name, @eventType, @round, @sortOrder)
      ON CONFLICT(id) DO UPDATE SET
        championship_id = excluded.championship_id,
        name = excluded.name,
        event_type = excluded.event_type,
        round = excluded.round,
        sort_order = excluded.sort_order
    `);
    stmt.run({
      id: event.id.value,
      championshipId: event.championshipId.value,
      name: event.name,
      eventType: event.eventType.value,
      round: event.round.value,
      sortOrder: event.sortOrder,
    });
  }

  update(event: Event): void {
    const stmt = this.db.prepare(`
      UPDATE events
      SET name = @name, event_type = @eventType, round = @round, sort_order = @sortOrder
      WHERE id = @id
    `);
    stmt.run({
      id: event.id.value,
      name: event.name,
      eventType: event.eventType.value,
      round: event.round.value,
      sortOrder: event.sortOrder,
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
    );
  }
}
