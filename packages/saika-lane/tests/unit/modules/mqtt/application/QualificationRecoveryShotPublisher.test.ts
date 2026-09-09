// SPDX-License-Identifier: MIT
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QualificationRecoveryShotPublisher } from '@/main/modules/mqtt/application/QualificationRecoveryShotPublisher';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import { SqliteQualificationRecoveryShotOutbox } from '@/main/modules/qualification-recovery';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Shot } from '@/main/modules/session/domain/Shot';
import { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

const LANE_ID = '11111111-1111-4111-8111-111111111111';
const COMPETITION_ID = '22222222-2222-4222-8222-222222222222';
const RUN_ID = '33333333-3333-4333-8333-333333333333';

describe('QualificationRecoveryShotPublisher', () => {
  let db: Database.Database;
  let mqttClient: IMqttClientService;
  let eventBus: TypedEventBus;
  let connected: boolean;
  let publisher: QualificationRecoveryShotPublisher;

  beforeEach(() => {
    db = createSqliteDb(':memory:');
    connected = false;
    mqttClient = {
      publish: vi.fn().mockResolvedValue(undefined),
      isConnected: vi.fn(() => connected),
      onConnect: vi.fn().mockReturnValue(() => undefined),
    } as unknown as IMqttClientService;
    eventBus = new TypedEventBus();
    publisher = new QualificationRecoveryShotPublisher(
      mqttClient,
      eventBus,
      { get: vi.fn().mockReturnValue(LANE_ID) } as unknown as ILocalStorage,
      {
        get: vi.fn().mockReturnValue({
          runId: RUN_ID,
          decisionId: '44444444-4444-4444-8444-444444444444',
          interruptionId: '55555555-5555-4555-8555-555555555555',
          competitionId: COMPETITION_ID,
          stageIndex: 1,
          seriesIndex: 0,
          authorization: { phase: 'SERIES_RECOVERY' },
        }),
      },
      new SqliteQualificationRecoveryShotOutbox(db),
    );
  });

  afterEach(() => db.close());

  it('durably queues an owned shot while offline and publishes it only on the recovery topic', async () => {
    const shot = Shot.create({
      impactPoint: new ImpactPoint(1.2, -0.4),
      score: new Score(100),
      mode: Mode.sighting(),
      timestamp: new Date('2026-09-03T01:01:10.000Z'),
      shotNumber: 4,
      seriesNumber: 0,
      innerTen: true,
      deviceScore: new Score(100),
      calculatedScore: new Score(101),
      receivedAt: new Date('2026-09-03T01:01:10.020Z'),
      sourceObservationId: '66666666-6666-4666-8666-666666666666',
      targetProfileId: 'ISSF_PISTOL_25M_PRECISION_2026',
      scoringGaugeProfileId: 'ISSF_SMALLBORE_5_60_2026',
    });
    eventBus.emit({
      type: 'ShotRecorded',
      timestamp: Date.now(),
      aggregateId: '77777777-7777-4777-8777-777777777777',
      shot,
      scoringMode: 'RING',
      acquisitionContext: { shotDisposition: 'ISOLATED', owner: 'qualification-recovery', referenceId: RUN_ID },
    });
    await vi.waitFor(() => {
      const row = db.prepare('SELECT COUNT(*) AS count FROM qualification_recovery_shot_outbox').get() as {
        count: number;
      };
      expect(row.count).toBe(1);
    });
    expect(mqttClient.publish).not.toHaveBeenCalled();

    connected = true;
    await publisher.requestDrain();

    const [topic, json, options] = vi.mocked(mqttClient.publish).mock.calls[0]!;
    expect(topic).toBe(`saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/qualification-recovery/shot`);
    expect(JSON.parse(json)).toMatchObject({
      runId: RUN_ID,
      shotId: shot.id,
      effectiveScoreX10: 100,
      calculatedScoreX10: 101,
      observationId: '66666666-6666-4666-8666-666666666666',
    });
    expect(options).toEqual({ qos: 1, retain: false });
    expect(
      (
        db.prepare('SELECT published_at FROM qualification_recovery_shot_outbox').get() as {
          published_at: string | null;
        }
      ).published_at,
    ).not.toBeNull();
  });

  it('ignores isolated acquisitions owned by another workflow', async () => {
    const shot = Shot.create({
      impactPoint: null,
      score: Score.miss(),
      mode: Mode.sighting(),
      timestamp: new Date(),
      shotNumber: 1,
      seriesNumber: 0,
      innerTen: false,
    });
    eventBus.emit({
      type: 'ShotRecorded',
      timestamp: Date.now(),
      aggregateId: 'session-1',
      shot,
      scoringMode: 'RING',
      acquisitionContext: { shotDisposition: 'ISOLATED', owner: 'shoot-off', referenceId: RUN_ID },
    });
    await Promise.resolve();

    expect(db.prepare('SELECT COUNT(*) AS count FROM qualification_recovery_shot_outbox').get()).toEqual({ count: 0 });
  });
});
