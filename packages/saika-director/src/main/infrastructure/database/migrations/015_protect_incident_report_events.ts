import type { Migration } from './Migration';

export const migration015ProtectIncidentReportEvents: Migration = {
  version: 15,
  name: 'protect_incident_report_events',
  up(db) {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_protect_incident_report_event_delete
      BEFORE DELETE ON events
      WHEN EXISTS (
        SELECT 1 FROM range_incident_reports WHERE event_id = OLD.id
      )
      BEGIN
        SELECT RAISE(ABORT, 'Cannot delete an event with Range Incident Reports');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_protect_incident_report_event_type
      BEFORE UPDATE OF event_type ON events
      WHEN OLD.event_type <> NEW.event_type AND EXISTS (
        SELECT 1 FROM range_incident_reports WHERE event_id = OLD.id
      )
      BEGIN
        SELECT RAISE(ABORT, 'Cannot change the type of an event with Range Incident Reports');
      END;
    `);
  },
};
