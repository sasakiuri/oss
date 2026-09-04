import type Database from 'better-sqlite3';

import type {
  EquipmentControlSubject,
  IEquipmentControlSubjectSource,
} from '../application/EquipmentControlSubjectSource';

interface SubjectRow {
  championship_id: string;
  event_id: string;
  event_name: string;
  event_type: string;
  round: string;
  participant_id: string;
  athlete_name: string;
  start_number: string | null;
  gender: string;
}

export class SqliteEquipmentControlSubjectSource implements IEquipmentControlSubjectSource {
  constructor(private readonly database: Database.Database) {}

  find(eventId: string, participantId: string): EquipmentControlSubject | null {
    const row = this.database
      .prepare(
        `SELECT event.championship_id,
                event.id AS event_id,
                event.name AS event_name,
                event.event_type,
                event.round,
                participant.id AS participant_id,
                participant.player_name AS athlete_name,
                participant.start_number,
                participant.gender
           FROM participants participant
           JOIN events event ON event.id = participant.event_id
          WHERE event.id = ? AND participant.id = ?`,
      )
      .get(eventId, participantId) as SubjectRow | undefined;
    return row
      ? {
          championshipId: row.championship_id,
          eventId: row.event_id,
          eventName: row.event_name,
          eventType: row.event_type,
          round: row.round,
          participantId: row.participant_id,
          athleteName: row.athlete_name,
          startNumber: row.start_number,
          gender: row.gender,
        }
      : null;
  }
}
