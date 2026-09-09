// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';

import { RangeOfficerRequestPublisher } from '@/main/modules/mqtt/application/RangeOfficerRequestPublisher';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import type { RangeOfficerRequestService } from '@/main/modules/range-officer-request';
import { RangeOfficerRequestState } from '@/main/modules/range-officer-request';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

const laneId = '11111111-1111-4111-8111-111111111111';

describe('RangeOfficerRequestPublisher', () => {
  it('publishes active state retained on the Lane-owned topic', async () => {
    const mqtt = {
      isConnected: vi.fn().mockReturnValue(true),
      publish: vi.fn().mockResolvedValue(undefined),
    } as unknown as IMqttClientService;
    const storage = { get: vi.fn().mockReturnValue(laneId) } as unknown as ILocalStorage;
    const state = RangeOfficerRequestState.request({
      requestId: '22222222-2222-4222-8222-222222222222',
      category: 'SCORING',
      message: 'Please inspect the score',
      requestedAt: new Date('2026-09-03T00:00:00.000Z'),
    });
    const service = { getState: vi.fn().mockReturnValue(state) } as unknown as RangeOfficerRequestService;

    await new RangeOfficerRequestPublisher(mqtt, storage, service).publishCurrentState();

    expect(mqtt.publish).toHaveBeenCalledWith(
      `saika/lane/${laneId}/range-officer/request`,
      expect.stringContaining('"status":"ACTIVE"'),
      { qos: 1, retain: true },
    );
  });

  it('does not publish while disconnected so reconnect can replay durable state', async () => {
    const mqtt = {
      isConnected: vi.fn().mockReturnValue(false),
      publish: vi.fn(),
    } as unknown as IMqttClientService;
    const publisher = new RangeOfficerRequestPublisher(
      mqtt,
      { get: vi.fn().mockReturnValue(laneId) } as unknown as ILocalStorage,
      { getState: vi.fn().mockReturnValue(null) } as unknown as RangeOfficerRequestService,
    );

    await publisher.publishCurrentState();
    expect(mqtt.publish).not.toHaveBeenCalled();
  });
});
