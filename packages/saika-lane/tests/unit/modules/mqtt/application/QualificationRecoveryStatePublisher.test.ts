// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { QualificationRecoveryStatePublisher } from '@/main/modules/mqtt/application/QualificationRecoveryStatePublisher';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import type {
  IQualificationRecoveryControl,
  QualificationRecoveryRunRecord,
} from '@/main/modules/qualification-recovery';
import { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

const LANE_ID = '11111111-1111-4111-8111-111111111111';
const COMPETITION_ID = '22222222-2222-4222-8222-222222222222';
const RUN_ID = '33333333-3333-4333-8333-333333333333';

function run(): QualificationRecoveryRunRecord {
  return {
    runId: RUN_ID,
    sequenceId: RUN_ID,
    decisionId: '44444444-4444-4444-8444-444444444444',
    interruptionId: '55555555-5555-4555-8555-555555555555',
    competitionId: COMPETITION_ID,
    stageIndex: 1,
    seriesIndex: 0,
    expectedMatchProgramId: 'P25_MATCH_PRECISION_240',
    executionProgramId: 'P25_MATCH_PRECISION_240',
    expectedSeriesShotLimit: 5,
    expectedRecordedShots: 3,
    authorization: {
      phase: 'SERIES_RECOVERY',
      seriesRecovery: {
        treatment: 'COMPLETE_REMAINING_SHOTS',
        shotsToFire: 2,
        execution: { mode: 'SECONDS_PER_SHOT', secondsPerShot: 48, totalSeconds: 96 },
      },
    },
    targetProfileId: 'ISSF_PISTOL_25M_PRECISION_2026',
    loadAt: new Date('2026-09-03T01:00:00.000Z'),
    officialName: 'Jury Member',
    decisionRuleReference: '8.8.1(c-d)',
    decidedAt: new Date('2026-09-03T00:59:00.000Z'),
    startedAt: new Date('2026-09-03T00:59:30.000Z'),
    status: 'RUNNING',
    terminalReason: null,
    terminalAt: null,
    shots: [],
  };
}

describe('QualificationRecoveryStatePublisher', () => {
  let mqttClient: IMqttClientService;
  let eventBus: TypedEventBus;
  let control: IQualificationRecoveryControl;
  let publisher: QualificationRecoveryStatePublisher;

  beforeEach(() => {
    mqttClient = {
      publish: vi.fn().mockResolvedValue(undefined),
      isConnected: vi.fn().mockReturnValue(true),
    } as unknown as IMqttClientService;
    eventBus = new TypedEventBus();
    control = { getLatest: vi.fn().mockReturnValue(run()) } as unknown as IQualificationRecoveryControl;
    const storage = { get: vi.fn().mockReturnValue(LANE_ID) } as unknown as ILocalStorage;
    publisher = new QualificationRecoveryStatePublisher(mqttClient, eventBus, storage, control);
  });

  it('publishes the independent run projection as retained state', async () => {
    await publisher.publishCurrentState(COMPETITION_ID);

    const [topic, json, options] = vi.mocked(mqttClient.publish).mock.calls[0]!;
    expect(topic).toBe(`saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/qualification-recovery/state`);
    expect(JSON.parse(json)).toMatchObject({
      schemaVersion: 1,
      runId: RUN_ID,
      status: 'RUNNING',
      authorization: { phase: 'SERIES_RECOVERY' },
    });
    expect(options).toEqual({ qos: 1, retain: true });
  });

  it('publishes state transitions without depending on timed-target subscribers', async () => {
    eventBus.emit({
      type: 'QualificationRecoveryChanged',
      timestamp: Date.now(),
      aggregateId: COMPETITION_ID,
      state: { ...run(), status: 'COMPLETED', terminalReason: 'closed', terminalAt: new Date() },
    });

    await vi.waitFor(() => expect(mqttClient.publish).toHaveBeenCalledOnce());
    expect(JSON.parse(vi.mocked(mqttClient.publish).mock.calls[0]![1])).toMatchObject({ status: 'COMPLETED' });
  });
});
