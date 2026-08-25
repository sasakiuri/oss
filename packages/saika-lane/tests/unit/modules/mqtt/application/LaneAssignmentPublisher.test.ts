// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LaneAssignmentPublisher } from '@/main/modules/mqtt/application/LaneAssignmentPublisher';
import type { IMqttClientService } from '@/main/modules/mqtt/infra/IMqttClientService';

import { createMockStorage } from '../../../../helpers/mockDependencies';

const COMPETITION_ID = 'b2222222-2222-4222-a222-222222222222';
const LANE_ID = 'a1111111-1111-4111-a111-111111111111';

describe('LaneAssignmentPublisher', () => {
  let mqttClient: IMqttClientService;
  let storage: ReturnType<typeof createMockStorage>;
  let publisher: LaneAssignmentPublisher;

  beforeEach(() => {
    mqttClient = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      setWill: vi.fn(),
      onMessage: vi.fn(),
      onConnect: vi.fn(),
      onDisconnect: vi.fn(),
      isConnected: vi.fn().mockReturnValue(true),
    };
    storage = createMockStorage();
    publisher = new LaneAssignmentPublisher(mqttClient, storage, () => LANE_ID);
  });

  it('persists and publishes an assignment as retained state', async () => {
    const athlete = { startNumber: 12, id: 'athlete-12', name: 'Test Athlete' };

    const result = await publisher.assign(COMPETITION_ID, athlete);

    expect(result).toMatchObject({ competitionId: COMPETITION_ID, laneId: LANE_ID, athlete });
    expect(result.assignedAt).not.toBeNull();
    expect(storage.set).toHaveBeenCalledWith(
      'mqtt.assignment',
      expect.objectContaining({ competitionId: COMPETITION_ID, athlete }),
    );
    expect(mqttClient.publish).toHaveBeenCalledWith(
      `saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/assignment`,
      expect.any(String),
      { qos: 1, retain: true },
    );
  });

  it('publishes null with assignedAt null when unassigning', async () => {
    const result = await publisher.assign(COMPETITION_ID, null);

    expect(result.athlete).toBeNull();
    expect(result.assignedAt).toBeNull();
  });

  it('re-publishes the persisted assignment after reconnect', async () => {
    await publisher.assign(COMPETITION_ID, { startNumber: 1, id: 'athlete-1', name: 'Athlete' });
    vi.mocked(mqttClient.publish).mockClear();

    await publisher.publishCurrentAssignment(COMPETITION_ID);

    expect(mqttClient.publish).toHaveBeenCalledOnce();
  });

  it('clears only the matching competition assignment', async () => {
    await publisher.assign(COMPETITION_ID, null);

    publisher.clearStoredAssignment(COMPETITION_ID);

    expect(storage.delete).toHaveBeenCalledWith('mqtt.assignment');
  });
});
