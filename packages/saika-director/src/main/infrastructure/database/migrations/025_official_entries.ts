import type { Migration } from './Migration';

function addColumnIfMissing(db: Parameters<Migration['up']>[0], column: string, definition: string): void {
  const columns = db.prepare('PRAGMA table_info(participants)').all() as { name: string }[];
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE participants ADD COLUMN ${column} ${definition}`);
  }
}

export const migration025OfficialEntries: Migration = {
  version: 25,
  name: 'official_entries',
  up(db) {
    addColumnIfMissing(db, 'start_number', 'TEXT');
    addColumnIfMissing(db, 'issf_id', 'TEXT');
    addColumnIfMissing(db, 'nation_code', 'TEXT');
    addColumnIfMissing(
      db,
      'gender',
      "TEXT NOT NULL DEFAULT 'UNSPECIFIED' CHECK (gender IN ('M', 'F', 'X', 'UNSPECIFIED'))",
    );
    addColumnIfMissing(
      db,
      'entry_status',
      "TEXT NOT NULL DEFAULT 'COMPETING' CHECK (entry_status IN ('COMPETING', 'RPO', 'MQS', 'OOC', 'DNS', 'DNF', 'DSQ', 'DQB'))",
    );
    addColumnIfMissing(db, 'team_id', 'TEXT');
    addColumnIfMissing(db, 'team_name', 'TEXT');
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_participants_event_team
        ON participants(event_id, team_id, entry_status, sort_order);
    `);
  },
};
