// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from 'vitest';

import { QualificationMalfunctionSignalPublisher } from '@/main/modules/mqtt/application/QualificationMalfunctionSignalPublisher';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import type { QualificationMalfunctionSignalService } from '@/main/modules/qualification-malfunction-signal';
import { QualificationMalfunctionSignalState } from '@/main/modules/qualification-malfunction-signal';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

const laneId = '11111111-1111-4111-8111-111111111111';

describe('QualificationMalfunctionSignalPublisher', () => {
  it('publishes an active declaration on a dedicated retained Lane topic', async () => {
    const mqtt = {
      isConnected: vi.fn().mockReturnValue(true),
      publish: vi.fn().mockResolvedValue(undefined),
    } as unknown as IMqttClientService;
    const state = QualificationMalfunctionSignalState.signal({
      signalId: '22222222-2222-4222-8222-222222222222',
      signalledAt: new Date('2026-09-04T00:00:00.000Z'),
      context: {
        competitionId: '33333333-3333-4333-8333-333333333333',
        sessionId: '44444444-4444-4444-8444-444444444444',
        participantId: 'participant-12',
        participantName: 'Test Athlete',
        startNumber: '12',
        phase: 'MATCH',
        stageIndex: 1,
        seriesIndex: 2,
        seriesShotLimit: 5,
        recordedShots: 3,
        timedTargetProgramId: 'rapid-4s',
        exposureIndex: 2,
      },
    });
    const service = { getState: vi.fn().mockReturnValue(state) } as unknown as QualificationMalfunctionSignalService;
    const publisher = new QualificationMalfunctionSignalPublisher(
      mqtt,
      { get: vi.fn().mockReturnValue(laneId) } as unknown as ILocalStorage,
      service,
    );

    await publisher.publishCurrentState();

    expect(mqtt.publish).toHaveBeenCalledWith(
      `saika/lane/${laneId}/qualification-malfunction/signal`,
      expect.stringContaining('"status":"ACTIVE"'),
      { qos: 1, retain: true },
    );
    const payload = JSON.parse(vi.mocked(mqtt.publish).mock.calls[0]![1] as string) as Record<string, unknown>;
    expect(payload).toMatchObject({
      signalId: state.signalId,
      context: { participantId: 'participant-12', recordedShots: 3, exposureIndex: 2 },
    });
    expect(payload).not.toHaveProperty('classification');
  });

  it('retains local state while disconnected for reconnect publication', async () => {
    const mqtt = { isConnected: vi.fn().mockReturnValue(false), publish: vi.fn() } as unknown as IMqttClientService;
    const publisher = new QualificationMalfunctionSignalPublisher(
      mqtt,
      { get: vi.fn().mockReturnValue(laneId) } as unknown as ILocalStorage,
      { getState: vi.fn().mockReturnValue(null) } as unknown as QualificationMalfunctionSignalService,
    );

    await publisher.publishCurrentState();

    expect(mqtt.publish).not.toHaveBeenCalled();
  });
});
