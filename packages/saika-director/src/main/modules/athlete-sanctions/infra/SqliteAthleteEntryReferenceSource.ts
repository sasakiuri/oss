import type Database from 'better-sqlite3';

import type {
  AthleteEntryReference,
  AthleteEventReference,
  IAthleteEntryReferenceSource,
} from '../application/AthleteEntryReferenceSource';

interface ParticipantReferenceRow {
  participant_id: string;
  event_id: string;
  event_name: string;
  championship_id: string;
  player_name: string;
  issf_id: string | null;
  entry_status: AthleteEntryReference['entryStatus'];
}

interface EventReferenceRow {
  event_id: string;
  championship_id: string;
  event_name: string;
}

export class SqliteAthleteEntryReferenceSource implements IAthleteEntryReferenceSource {
  constructor(private readonly database: Database.Database) {}

  championshipExists(championshipId: string): boolean {
    return this.database.prepare('SELECT 1 FROM championships WHERE id = ?').get(championshipId) !== undefined;
  }

  findEvent(eventId: string): AthleteEventReference | null {
    const row = this.database
      .prepare('SELECT id AS event_id, championship_id, name AS event_name FROM events WHERE id = ?')
      .get(eventId) as EventReferenceRow | undefined;
    return row ? toEventReference(row) : null;
  }

  findParticipant(participantId: string): AthleteEntryReference | null {
    const row = this.database.prepare(`${participantSelect} WHERE participant.id = ?`).get(participantId) as
      ParticipantReferenceRow | undefined;
    return row ? toParticipantReference(row) : null;
  }

  findParticipantsByEvent(eventId: string): AthleteEntryReference[] {
    return (
      this.database
        .prepare(`${participantSelect} WHERE event.id = ? ORDER BY participant.sort_order, participant.id`)
        .all(eventId) as ParticipantReferenceRow[]
    ).map(toParticipantReference);
  }

  findParticipantsByChampionship(championshipId: string): AthleteEntryReference[] {
    return (
      this.database
        .prepare(
          `${participantSelect}
           WHERE event.championship_id = ?
           ORDER BY event.sort_order, event.id, participant.sort_order, participant.id`,
        )
        .all(championshipId) as ParticipantReferenceRow[]
    ).map(toParticipantReference);
  }
}

const participantSelect = `
  SELECT participant.id AS participant_id,
         event.id AS event_id,
         event.name AS event_name,
         event.championship_id,
         participant.player_name,
         participant.issf_id,
         participant.entry_status
  FROM participants participant
  JOIN events event ON event.id = participant.event_id
`;

function toParticipantReference(row: ParticipantReferenceRow): AthleteEntryReference {
  return {
    participantId: row.participant_id,
    eventId: row.event_id,
    eventName: row.event_name,
    championshipId: row.championship_id,
    playerName: row.player_name,
    issfId: row.issf_id,
    entryStatus: row.entry_status,
  };
}

function toEventReference(row: EventReferenceRow): AthleteEventReference {
  return { eventId: row.event_id, championshipId: row.championship_id, eventName: row.event_name };
}
