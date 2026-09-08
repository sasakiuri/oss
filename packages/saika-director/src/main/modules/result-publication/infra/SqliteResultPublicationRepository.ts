import type Database from 'better-sqlite3';

import type { IResultPublicationRepository } from '../domain/IResultPublicationRepository';
import {
  reconstructResultPublicationEntry,
  type ResultPublicationEntry,
  type ResultPublicationScope,
} from '../domain/ResultPublicationEntry';

interface ResultPublicationEntryRow {
  id: string;
  event_id: string;
  result_scope: ResultPublicationScope;
  entry_type: ResultPublicationEntry['type'];
  preliminary_id: string;
  payload_json: string;
  recorded_at: string;
}

export class SqliteResultPublicationRepository implements IResultPublicationRepository {
  constructor(private readonly db: Database.Database) {}

  append(entry: ResultPublicationEntry): void {
    this.db
      .prepare(
        `INSERT INTO result_publication_entries (
           id, event_id, result_scope, entry_type, preliminary_id, payload_json, recorded_at
         ) VALUES (
           @id, @eventId, @resultScope, @entryType, @preliminaryId, @payloadJson, @recordedAt
         )`,
      )
      .run({
        id: entry.id,
        eventId: entry.eventId,
        resultScope: entry.resultScope,
        entryType: entry.type,
        preliminaryId: entry.preliminaryId,
        payloadJson: JSON.stringify(toPayload(entry)),
        recordedAt: entry.recordedAt.toISOString(),
      });
  }

  findByEvent(eventId: string, resultScope: ResultPublicationScope): ResultPublicationEntry[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM result_publication_entries
         WHERE event_id = ? AND result_scope = ?
         ORDER BY rowid`,
      )
      .all(eventId, resultScope) as ResultPublicationEntryRow[];
    return rows.map(toEntry);
  }
}

function toPayload(entry: ResultPublicationEntry): Record<string, string> {
  switch (entry.type) {
    case 'PRELIMINARY_PUBLISHED':
      return {
        snapshotRevision: entry.snapshotRevision,
        postedAt: entry.postedAt.toISOString(),
        protestEndsAt: entry.protestEndsAt.toISOString(),
        officialName: entry.officialName,
        ...(entry.postingLocation !== undefined ? { postingLocation: entry.postingLocation } : {}),
        ...(entry.postingReference !== undefined ? { postingReference: entry.postingReference } : {}),
      };
    case 'PROTEST_REGISTERED':
      return { protestReference: entry.protestReference };
    case 'PROTEST_RESOLVED':
      return {
        protestReference: entry.protestReference,
        resolution: entry.resolution,
        officialName: entry.officialName,
      };
    case 'OFFICIAL_PUBLISHED':
      return {
        snapshotRevision: entry.snapshotRevision,
        approvalId: entry.approvalId,
        officialName: entry.officialName,
      };
  }
}

function toEntry(row: ResultPublicationEntryRow): ResultPublicationEntry {
  const payload = parsePayload(row.payload_json);
  const base = {
    id: row.id,
    eventId: row.event_id,
    resultScope: row.result_scope,
    preliminaryId: row.preliminary_id,
    recordedAt: parseDate(row.recorded_at, 'recorded_at'),
  };
  switch (row.entry_type) {
    case 'PRELIMINARY_PUBLISHED':
      return reconstructResultPublicationEntry({
        ...base,
        type: row.entry_type,
        snapshotRevision: requiredString(payload, 'snapshotRevision'),
        postedAt: parseDate(requiredString(payload, 'postedAt'), 'postedAt'),
        protestEndsAt: parseDate(requiredString(payload, 'protestEndsAt'), 'protestEndsAt'),
        officialName: requiredString(payload, 'officialName'),
        ...(payload.postingLocation !== undefined
          ? { postingLocation: requiredString(payload, 'postingLocation') }
          : {}),
        ...(payload.postingReference !== undefined
          ? { postingReference: requiredString(payload, 'postingReference') }
          : {}),
      });
    case 'PROTEST_REGISTERED':
      return reconstructResultPublicationEntry({
        ...base,
        type: row.entry_type,
        protestReference: requiredString(payload, 'protestReference'),
      });
    case 'PROTEST_RESOLVED':
      return reconstructResultPublicationEntry({
        ...base,
        type: row.entry_type,
        protestReference: requiredString(payload, 'protestReference'),
        resolution: requiredString(payload, 'resolution'),
        officialName: requiredString(payload, 'officialName'),
      });
    case 'OFFICIAL_PUBLISHED':
      return reconstructResultPublicationEntry({
        ...base,
        type: row.entry_type,
        snapshotRevision: requiredString(payload, 'snapshotRevision'),
        approvalId: requiredString(payload, 'approvalId'),
        officialName: requiredString(payload, 'officialName'),
      });
  }
}

function parsePayload(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('payload_json must contain an object');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid result publication payload: ${message}`);
  }
}

function requiredString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid result publication payload field ${key}`);
  }
  return value;
}

function parseDate(value: string, name: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid result publication date ${name}`);
  return date;
}
