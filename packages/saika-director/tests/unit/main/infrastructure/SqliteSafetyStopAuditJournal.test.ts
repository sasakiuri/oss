import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { migration022ShotObservationEvidence } from '@/main/infrastructure/database/migrations/022_shot_observation_evidence';
import { migration035RangeSafetyStop } from '@/main/infrastructure/database/migrations/035_range_safety_stop';
import { migration062RangeSafetyLaneClearances } from '@/main/infrastructure/database/migrations/062_range_safety_lane_clearances';
import { SqliteSafetyStopAuditJournal } from '@/main/modules/mqtt/infra/SqliteSafetyStopAuditJournal';

describe('SqliteSafetyStopAuditJournal', () => {
  let database: Database.Database | undefined;

  afterEach(() => database?.close());

  it('round-trips append-only Lane acknowledgement evidence', () => {
    database = new Database(':memory:');
    migration022ShotObservationEvidence.up(database);
    migration035RangeSafetyStop.up(database);
    migration062RangeSafetyLaneClearances.up(database);
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
      laneClearances: [],
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

  it('round-trips append-only per-Lane and per-athlete physical clearance evidence', () => {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    migration022ShotObservationEvidence.up(database);
    migration035RangeSafetyStop.up(database);
    migration062RangeSafetyLaneClearances.up(database);
    const journal = new SqliteSafetyStopAuditJournal(database);
    journal.append({
      id: '11111111-1111-4111-8111-111111111111',
      safetyStopId: '77777777-7777-4777-8777-777777777777',
      operation: 'CLEAR',
      targetLaneIds: ['22222222-2222-4222-8222-222222222222'],
      success: true,
      reason: 'Range inspected',
      officialName: 'CRO One',
      occurredAt: new Date('2026-09-01T01:01:00Z'),
      recordedAt: new Date('2026-09-01T01:01:01Z'),
      laneOutcomes: [
        {
          laneId: '22222222-2222-4222-8222-222222222222',
          status: 'done',
          errorCode: null,
          errorMessage: null,
          acknowledgedAt: new Date('2026-09-01T01:01:00.500Z'),
        },
      ],
      laneClearances: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          laneId: '22222222-2222-4222-8222-222222222222',
          participantId: 'athlete-a',
          participantName: 'Athlete A',
          athleteConfirmationStatus: 'CONFIRMED',
          athleteConfirmedBy: 'Athlete A',
          notApplicableReason: null,
          firearmCondition: 'UNLOADED_SAFETY_FLAG_INSERTED',
          personnelClear: true,
          verifiedBy: 'RO One',
          verificationNote: 'Chamber and flag visually checked.',
          verifiedAt: new Date('2026-09-01T01:00:55Z'),
          recordedAt: new Date('2026-09-01T01:01:01Z'),
          ruleReferences: ['ISSF 6.2.2.4', 'ISSF 6.2.3.6'],
        },
      ],
    });

    expect(journal.find('77777777-7777-4777-8777-777777777777')[0]?.laneClearances).toMatchObject([
      {
        participantName: 'Athlete A',
        athleteConfirmationStatus: 'CONFIRMED',
        firearmCondition: 'UNLOADED_SAFETY_FLAG_INSERTED',
        personnelClear: true,
        verifiedBy: 'RO One',
      },
    ]);
    expect(() =>
      database!
        .prepare('UPDATE range_safety_lane_clearances SET verified_by = ? WHERE id = ?')
        .run('Other', '33333333-3333-4333-8333-333333333333'),
    ).toThrow('append-only');
  });

  it('accepts quarantined shot evidence after the safety migration', () => {
    database = new Database(':memory:');
    migration022ShotObservationEvidence.up(database);
    migration035RangeSafetyStop.up(database);
    migration062RangeSafetyLaneClearances.up(database);
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
