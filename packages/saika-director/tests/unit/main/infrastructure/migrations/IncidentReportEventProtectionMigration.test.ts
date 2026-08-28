import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migration003CreateSchema } from '@/main/infrastructure/database/migrations/003_create_schema';
import { migration014RangeIncidentReports } from '@/main/infrastructure/database/migrations/014_range_incident_reports';
import { migration015ProtectIncidentReportEvents } from '@/main/infrastructure/database/migrations/015_protect_incident_report_events';
import { RangeIncidentReport } from '@/main/modules/incident-reports/domain/RangeIncidentReport';
import { SqliteRangeIncidentReportRepository } from '@/main/modules/incident-reports/infra/SqliteRangeIncidentReportRepository';

const CHAMPIONSHIP_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';

describe('incident-report event protection migration', () => {
  let database: Database.Database;

  beforeEach(() => {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    migration003CreateSchema.up(database);
    migration014RangeIncidentReports.up(database);
    migration015ProtectIncidentReportEvents.up(database);
    database
      .prepare('INSERT INTO championships (id, name, date, venue) VALUES (?, ?, ?, ?)')
      .run(CHAMPIONSHIP_ID, 'Championship', '2026-08-29', 'Tokyo');
    database
      .prepare(
        `INSERT INTO events (id, championship_id, name, event_type, round, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(EVENT_ID, CHAMPIONSHIP_ID, '10m Air Rifle', 'BR60S', 'Qualification', 0);
    new SqliteRangeIncidentReportRepository(database).appendReport(
      RangeIncidentReport.create({
        eventId: EVENT_ID,
        serialNumber: 'IR-42',
        eventName: '10m Air Rifle',
        occurredAt: new Date('2026-08-29T01:02:03.000Z'),
        details: 'Incident',
        ruleReferences: '6.14.6',
        initiatorRole: 'RANGE_OFFICER',
        initiatorName: 'Range Officer A',
      }),
    );
  });

  afterEach(() => database.close());

  it('prevents event and championship deletion from orphaning an audit report', () => {
    expect(() => database.prepare('DELETE FROM events WHERE id = ?').run(EVENT_ID)).toThrow(
      'Cannot delete an event with Range Incident Reports',
    );
    expect(() => database.prepare('DELETE FROM championships WHERE id = ?').run(CHAMPIONSHIP_ID)).toThrow(
      'Cannot delete an event with Range Incident Reports',
    );
  });

  it('allows event renaming but rejects a competition-type change after an incident is recorded', () => {
    expect(() =>
      database.prepare('UPDATE events SET name = ? WHERE id = ?').run('Renamed event', EVENT_ID),
    ).not.toThrow();
    expect(() => database.prepare('UPDATE events SET event_type = ? WHERE id = ?').run('BP60', EVENT_ID)).toThrow(
      'Cannot change the type of an event with Range Incident Reports',
    );
  });
});
