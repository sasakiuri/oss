import type Database from 'better-sqlite3';
import type { IFiringPointAssignmentRepository } from '../domain/IFiringPointAssignmentRepository';
import { FiringPointAssignment } from '../domain/FiringPointAssignment';
import { FiringPointAssignmentId } from '../domain/FiringPointAssignmentId';
import { EventId } from '../domain/EventId';
import { ParticipantId } from '../domain/ParticipantId';

interface FiringPointAssignmentRow {
  id: string;
  event_id: string;
  relay_number: number;
  firing_point_number: number;
  participant_id: string;
}

export class SqliteFiringPointAssignmentRepository implements IFiringPointAssignmentRepository {
  constructor(private readonly db: Database.Database) {}

  saveAll(assignments: FiringPointAssignment[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO firing_point_assignments (id, event_id, relay_number, firing_point_number, participant_id)
      VALUES (@id, @eventId, @relayNumber, @firingPointNumber, @participantId)
    `);
    const transaction = this.db.transaction((items: FiringPointAssignment[]) => {
      for (const a of items) {
        stmt.run({
          id: a.id.value,
          eventId: a.eventId.value,
          relayNumber: a.relayNumber,
          firingPointNumber: a.firingPointNumber,
          participantId: a.participantId.value,
        });
      }
    });
    transaction(assignments);
  }

  findByEventId(eventId: string): FiringPointAssignment[] {
    const stmt = this.db.prepare(
      'SELECT * FROM firing_point_assignments WHERE event_id = ? ORDER BY relay_number, firing_point_number',
    );
    const rows = stmt.all(eventId) as FiringPointAssignmentRow[];
    return rows.map((row) => this.toEntity(row));
  }

  findByEventIdAndRelay(eventId: string, relayNumber: number): FiringPointAssignment[] {
    const stmt = this.db.prepare(
      'SELECT * FROM firing_point_assignments WHERE event_id = ? AND relay_number = ? ORDER BY firing_point_number',
    );
    const rows = stmt.all(eventId, relayNumber) as FiringPointAssignmentRow[];
    return rows.map((row) => this.toEntity(row));
  }

  deleteByEventId(eventId: string): void {
    const stmt = this.db.prepare('DELETE FROM firing_point_assignments WHERE event_id = ?');
    stmt.run(eventId);
  }

  executeInTransaction(fn: () => void): void {
    const transaction = this.db.transaction(() => {
      fn();
    });
    transaction();
  }

  private toEntity(row: FiringPointAssignmentRow): FiringPointAssignment {
    return FiringPointAssignment.reconstruct(
      FiringPointAssignmentId.create(row.id),
      EventId.create(row.event_id),
      row.relay_number,
      row.firing_point_number,
      ParticipantId.create(row.participant_id),
    );
  }
}
