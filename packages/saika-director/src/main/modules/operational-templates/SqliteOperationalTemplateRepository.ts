import type Database from 'better-sqlite3';

import {
  OperationalTemplateSchema,
  type OperationalTemplateDto,
} from '@/shared/ipc/contracts/operationalTemplates.contract';

import type { IOperationalTemplateRepository } from './OperationalTemplateService';

export class SqliteOperationalTemplateRepository implements IOperationalTemplateRepository {
  constructor(private readonly db: Database.Database) {}

  list(): OperationalTemplateDto[] {
    const rows = this.db
      .prepare(
        `SELECT id, name, description, modes_json, revision, updated_at FROM operational_setting_templates ORDER BY name COLLATE NOCASE, id`,
      )
      .all() as {
      id: string;
      name: string;
      description: string;
      modes_json: string;
      revision: number;
      updated_at: string;
    }[];
    return rows.map((row) =>
      OperationalTemplateSchema.parse({
        id: row.id,
        name: row.name,
        description: row.description,
        modes: JSON.parse(row.modes_json),
        revision: row.revision,
        updatedAt: row.updated_at,
      }),
    );
  }

  save(value: OperationalTemplateDto, expectedRevision: number): void {
    const template = OperationalTemplateSchema.parse(value);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0 || template.revision !== expectedRevision + 1)
      throw new Error('Invalid template revision');
    this.db.transaction(() => {
      const duplicate = this.db
        .prepare('SELECT id FROM operational_setting_templates WHERE name = ? COLLATE NOCASE AND id <> ?')
        .get(template.name, template.id);
      if (duplicate) throw new Error('A template already uses this name');
      if (expectedRevision === 0) {
        const count = this.db.prepare('SELECT COUNT(*) AS count FROM operational_setting_templates').get() as {
          count: number;
        };
        if (count.count >= 100) throw new Error('Remove an unused template before adding more than 100 templates');
        this.db
          .prepare(
            `INSERT INTO operational_setting_templates (id, name, description, modes_json, revision, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(
            template.id,
            template.name,
            template.description,
            JSON.stringify(template.modes),
            template.revision,
            template.updatedAt,
          );
      } else {
        const result = this.db
          .prepare(
            `UPDATE operational_setting_templates SET name = ?, description = ?, modes_json = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ?`,
          )
          .run(
            template.name,
            template.description,
            JSON.stringify(template.modes),
            template.revision,
            template.updatedAt,
            template.id,
            expectedRevision,
          );
        if (result.changes !== 1) throw new Error('The template changed or was removed; reload it before saving');
      }
    })();
  }

  remove(id: string, expectedRevision: number): void {
    const result = this.db
      .prepare('DELETE FROM operational_setting_templates WHERE id = ? AND revision = ?')
      .run(id, expectedRevision);
    if (result.changes !== 1) throw new Error('The template changed or was removed; reload it before removing');
  }
}
