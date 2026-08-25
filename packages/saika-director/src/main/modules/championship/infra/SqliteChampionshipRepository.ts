import type Database from 'better-sqlite3';
import type { IChampionshipRepository } from '../domain/IChampionshipRepository';
import { Championship } from '../domain/Championship';
import { ChampionshipId } from '../domain/ChampionshipId';
import { ChampionshipInfo } from '../domain/ChampionshipInfo';

interface ChampionshipRow {
  id: string;
  name: string;
  date: string;
  venue: string;
  created_at: string;
}

export class SqliteChampionshipRepository implements IChampionshipRepository {
  constructor(private readonly db: Database.Database) {}

  save(championship: Championship): void {
    const stmt = this.db.prepare(`
      INSERT INTO championships (id, name, date, venue, created_at)
      VALUES (@id, @name, @date, @venue, @createdAt)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        date = excluded.date,
        venue = excluded.venue,
        created_at = excluded.created_at
    `);
    stmt.run({
      id: championship.id.value,
      name: championship.info.name,
      date: championship.info.date,
      venue: championship.info.venue,
      createdAt: championship.createdAt.toISOString(),
    });
  }

  findById(id: string): Championship | null {
    const stmt = this.db.prepare('SELECT * FROM championships WHERE id = ?');
    const row = stmt.get(id) as ChampionshipRow | undefined;
    if (!row) return null;
    return this.toEntity(row);
  }

  findAll(): Championship[] {
    const stmt = this.db.prepare('SELECT * FROM championships ORDER BY created_at DESC');
    const rows = stmt.all() as ChampionshipRow[];
    return rows.map((row) => this.toEntity(row));
  }

  delete(id: string): void {
    const stmt = this.db.prepare('DELETE FROM championships WHERE id = ?');
    stmt.run(id);
  }

  update(championship: Championship): void {
    const stmt = this.db.prepare(`
      UPDATE championships
      SET name = @name, date = @date, venue = @venue
      WHERE id = @id
    `);
    stmt.run({
      id: championship.id.value,
      name: championship.info.name,
      date: championship.info.date,
      venue: championship.info.venue,
    });
  }

  private toEntity(row: ChampionshipRow): Championship {
    return Championship.reconstruct(
      ChampionshipId.create(row.id),
      ChampionshipInfo.create(row.name, row.date, row.venue),
      new Date(row.created_at),
    );
  }
}
