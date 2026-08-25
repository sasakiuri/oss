import Database from 'better-sqlite3';
import { MigrationRunner } from './migrations/MigrationRunner';
import { allMigrations } from './migrations';

export class DatabaseManager {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    new MigrationRunner(this.db).run(allMigrations);
  }

  getDatabase(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}
