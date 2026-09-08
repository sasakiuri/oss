import type Database from 'better-sqlite3';

import {
  equipmentRegistryEntrySchema,
  type EquipmentRegistryEntry,
} from '@/shared/ipc/contracts/equipmentRegistry.contract';

import type { IEquipmentRegistryRepository } from './EquipmentRegistryService';

export class SqliteEquipmentRegistryRepository implements IEquipmentRegistryRepository {
  constructor(private readonly database: Database.Database) {}
  list(championshipId: string): EquipmentRegistryEntry[] {
    const rows = this.database
      .prepare('SELECT payload_json FROM equipment_registry_entries WHERE championship_id = ? ORDER BY sequence')
      .all(championshipId) as { payload_json: string }[];
    return rows.map((row) => equipmentRegistryEntrySchema.parse(JSON.parse(row.payload_json)));
  }
  append(entry: EquipmentRegistryEntry, expectedRevision: number): void {
    const validated = equipmentRegistryEntrySchema.parse(entry);
    this.database.transaction(() => {
      const { count } = this.database
        .prepare('SELECT COUNT(*) AS count FROM equipment_registry_entries WHERE championship_id = ?')
        .get(validated.championshipId) as { count: number };
      if (count !== expectedRevision) throw new Error('Equipment records changed; reload before saving');
      this.database
        .prepare('INSERT INTO equipment_registry_entries (id, championship_id, kind, payload_json) VALUES (?, ?, ?, ?)')
        .run(validated.id, validated.championshipId, validated.kind, JSON.stringify(validated));
    })();
  }
}
