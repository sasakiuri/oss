import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { migration022ShotObservationEvidence } from '@/main/infrastructure/database/migrations/022_shot_observation_evidence';
import { migration035RangeSafetyStop } from '@/main/infrastructure/database/migrations/035_range_safety_stop';
import { SqliteSafetyStopAuditJournal } from '@/main/modules/mqtt/infra/SqliteSafetyStopAuditJournal';

describe('SqliteSafetyStopAuditJournal', () => {
  let database: Database.Database | undefined;

  afterEach(() => database?.close());

  it('round-trips append-only Lane acknowledgement evidence', () => {
    database = new Database(':memory:');
    migration022ShotObservationEvidence.up(database);
    migration035RangeSafetyStop.up(database);
    const journal = new SqliteSafetyStopAuditJournal(database);
    journal.append({
      id: '11111111-1111-4111-8111-111111111111',
      safetyStopId: '77777777-7777-4777-8777-777777777777',
      operation: 'ACTIVATE',
      targetLaneIds: ['22222222-2222-4222-8222-222222222222'],
      success: false,
      reason: 'Emergency',
      officialName: 'CRO One',
      occurredAt: new Date('2026-09-01T01:00:00Z'),
      recordedAt: new Date('2026-09-01T01:00:01Z'),
      laneOutcomes: [
        {
          laneId: '22222222-2222-4222-8222-222222222222',
          status: 'timeout',
          errorCode: null,
          errorMessage: null,
          acknowledgedAt: null,
        },
      ],
    });

    expect(journal.find('77777777-7777-4777-8777-777777777777')).toMatchObject([
      {
        operation: 'ACTIVATE',
        success: false,
        laneOutcomes: [{ status: 'timeout', acknowledgedAt: null }],
      },
    ]);
    expect(() => database!.prepare('DELETE FROM range_safety_stop_audit').run()).toThrow('append-only');
  }, 10_000);

  it('accepts quarantined shot evidence after the safety migration', () => {
    database = new Database(':memory:');
    migration022ShotObservationEvidence.up(database);
    migration035RangeSafetyStop.up(database);
    expect(() =>
      database!
        .prepare(
          `INSERT INTO mqtt_shot_observation_evidence (
             evidence_id, observation_id, competition_id, lane_id, outcome,
             fired_at, received_at, observed_at, payload_json
           ) VALUES ('e', 'o', NULL, 'lane', 'QUARANTINED_SAFETY_STOP', 't', 't', 't', '{}')`,
        )
        .run(),
    ).not.toThrow();
  });
});
