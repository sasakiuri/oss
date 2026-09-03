import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';

import type {
  EliminationPlanningSourceSnapshot,
  IEliminationPlanningSource,
} from '../domain/IEliminationPlanningSource';

interface EventRow {
  event_type: string;
}

interface ParticipantRow {
  id: string;
  nation_code: string | null;
  team_id: string | null;
  entry_status: string;
}

interface AssignmentRow {
  participant_id: string;
  relay_number: number;
  firing_point_number: number;
}

export class SqliteEliminationPlanningSource implements IEliminationPlanningSource {
  constructor(private readonly db: Database.Database) {}

  get(eventId: string): EliminationPlanningSourceSnapshot | null {
    const event = this.db.prepare('SELECT event_type FROM events WHERE id = ?').get(eventId) as EventRow | undefined;
    if (!event) return null;
    const participants = (
      this.db
        .prepare(
          `SELECT id, nation_code, team_id, entry_status
           FROM participants
           WHERE event_id = ? AND entry_status IN ('COMPETING', 'RPO', 'MQS', 'OOC')
           ORDER BY id`,
        )
        .all(eventId) as ParticipantRow[]
    ).map((participant) => ({ ...participant }));
    const participantIds = new Set(participants.map((participant) => participant.id));
    const assignments = (
      this.db
        .prepare(
          `SELECT participant_id, relay_number, firing_point_number
           FROM firing_point_assignments WHERE event_id = ?
           ORDER BY relay_number, firing_point_number, participant_id`,
        )
        .all(eventId) as AssignmentRow[]
    ).filter((assignment) => participantIds.has(assignment.participant_id));
    const assignedIds = new Set(assignments.map((assignment) => assignment.participant_id));
    const relayStartCounts =
      participants.length > 0 && assignedIds.size === participants.length && assignments.length === participants.length
        ? countRelays(assignments)
        : undefined;
    const source = {
      competitionTypeId: event.event_type,
      participants,
      assignments,
    };
    return {
      competitionTypeId: event.event_type,
      entryCount: participants.length,
      ...(relayStartCounts ? { relayStartCounts } : {}),
      sourceHash: createHash('sha256').update(JSON.stringify(source)).digest('hex'),
    };
  }
}

function countRelays(assignments: readonly AssignmentRow[]): number[] {
  const highestRelay = Math.max(...assignments.map((assignment) => assignment.relay_number));
  return Array.from(
    { length: highestRelay },
    (_, index) => assignments.filter((assignment) => assignment.relay_number === index + 1).length,
  );
}
