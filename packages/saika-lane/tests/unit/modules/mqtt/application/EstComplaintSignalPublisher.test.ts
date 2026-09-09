// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from 'vitest';

import { EstComplaintSignalState, type EstComplaintSignalService } from '@/main/modules/est-complaint-signal';
import { EstComplaintSignalPublisher } from '@/main/modules/mqtt/application/EstComplaintSignalPublisher';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

const laneId = '11111111-1111-4111-8111-111111111111';

describe('EstComplaintSignalPublisher', () => {
  it('publishes an active complaint on a dedicated retained Lane topic', async () => {
    const mqtt = {
      isConnected: vi.fn().mockReturnValue(true),
      publish: vi.fn().mockResolvedValue(undefined),
    } as unknown as IMqttClientService;
    const state = EstComplaintSignalState.signal({
      signalId: '22222222-2222-4222-8222-222222222222',
      issue: 'SHOT_VALUE',
      signalledAt: new Date('2026-09-04T00:00:01.000Z'),
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
        lastShot: {
          shotId: '55555555-5555-4555-8555-555555555555',
          shotNumberInSeries: 3,
          firedAt: '2026-09-04T00:00:00.000Z',
          receivedAt: '2026-09-04T00:00:00.100Z',
        },
      },
    });
    const service = { getState: vi.fn().mockReturnValue(state) } as unknown as EstComplaintSignalService;
    const publisher = new EstComplaintSignalPublisher(
      mqtt,
      { get: vi.fn().mockReturnValue(laneId) } as unknown as ILocalStorage,
      service,
    );

    await publisher.publishCurrentState();

    expect(mqtt.publish).toHaveBeenCalledWith(
      `saika/lane/${laneId}/est-complaint/signal`,
      expect.stringContaining('"issue":"SHOT_VALUE"'),
      { qos: 1, retain: true },
    );
    const payload = JSON.parse(vi.mocked(mqtt.publish).mock.calls[0]![1] as string) as Record<string, unknown>;
    expect(payload).toMatchObject({
      signalId: state.signalId,
      context: { participantId: 'participant-12', lastShot: { shotNumberInSeries: 3 } },
    });
    expect(payload).not.toHaveProperty('timeliness');
  });
});
