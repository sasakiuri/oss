// SPDX-License-Identifier: MIT
import type Database from 'better-sqlite3';

import type { CommandObservation, ICommandObservationRepository } from '../domain/ICommandObservationRepository';

export class SqliteCommandObservationRepository implements ICommandObservationRepository {
  constructor(private readonly db: Database.Database) {}

  findById(id: string): CommandObservation | null {
    const row = this.db.prepare('SELECT observation_json FROM official_command_observations WHERE id = ?').get(id) as
      { observation_json: string } | undefined;
    return row ? (JSON.parse(row.observation_json) as CommandObservation) : null;
  }

  findBySequence(sequenceId: string): readonly CommandObservation[] {
    const rows = this.db
      .prepare('SELECT observation_json FROM official_command_observations WHERE sequence_id = ? ORDER BY rowid')
      .all(sequenceId) as { observation_json: string }[];
    return rows.map((row) => JSON.parse(row.observation_json) as CommandObservation);
  }

  append(observation: CommandObservation): void {
    this.db
      .prepare(
        'INSERT INTO official_command_observations (id, sequence_id, competition_id, observation_json) VALUES (?, ?, ?, ?)',
      )
      .run(observation.id, observation.sequenceId, observation.competitionId, JSON.stringify(observation));
  }
}
