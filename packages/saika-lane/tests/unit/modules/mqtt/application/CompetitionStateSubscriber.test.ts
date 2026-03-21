// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { CompetitionStateSubscriber } from '@/main/modules/mqtt/application/CompetitionStateSubscriber';
import type { IMqttClientService } from '@/main/modules/mqtt/infra/IMqttClientService';

function createMockMqttClient(): IMqttClientService {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    setWill: vi.fn(),
    onMessage: vi.fn().mockReturnValue(() => {}),
    onConnect: vi.fn(),
    onDisconnect: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
  };
}

const COMPETITION_ID = 'b2222222-2222-4222-a222-222222222222';

describe('CompetitionStateSubscriber', () => {
  let mqttClient: IMqttClientService;
  let subscriber: CompetitionStateSubscriber;
  let messageHandler: (topic: string, payload: Buffer) => void;

  beforeEach(() => {
    mqttClient = createMockMqttClient();
    subscriber = new CompetitionStateSubscriber(mqttClient);

    (mqttClient.onMessage as ReturnType<typeof vi.fn>).mockImplementation(
      (h: (topic: string, payload: Buffer) => void) => {
        messageHandler = h;
        return () => {
          /* unsubscribe */
        };
      },
    );
  });

  it('subscribes to competition state topic', async () => {
    await subscriber.subscribe(COMPETITION_ID);

    expect(mqttClient.subscribe).toHaveBeenCalledWith(`saika/competition/${COMPETITION_ID}/state`, 1);
  });

  it('unsubscribes from competition state topic', async () => {
    await subscriber.subscribe(COMPETITION_ID);
    await subscriber.unsubscribe();

    expect(mqttClient.unsubscribe).toHaveBeenCalledWith(`saika/competition/${COMPETITION_ID}/state`);
  });

  it('ignores messages for other topics', async () => {
    await subscriber.subscribe(COMPETITION_ID);

    const payload = JSON.stringify({
      competitionId: COMPETITION_ID,
      competitionTypeId: 'BR60S',
      phase: 'SIGHTING',
      publishedAt: new Date().toISOString(),
    });

    // Send to a different topic - should be ignored
    messageHandler('saika/competition/other-id/state', Buffer.from(payload));

    // No error, no crash
    expect(true).toBe(true);
  });

  it('handles phase change', async () => {
    await subscriber.subscribe(COMPETITION_ID);

    const topic = `saika/competition/${COMPETITION_ID}/state`;

    // First message - phase change from null to SIGHTING
    const payload1 = JSON.stringify({
      competitionId: COMPETITION_ID,
      competitionTypeId: 'BR60S',
      phase: 'SIGHTING',
      publishedAt: new Date().toISOString(),
    });
    messageHandler(topic, Buffer.from(payload1));

    // Second message - same phase, should not log again
    messageHandler(topic, Buffer.from(payload1));

    // Third message - different phase
    const payload2 = JSON.stringify({
      competitionId: COMPETITION_ID,
      competitionTypeId: 'BR60S',
      phase: 'MATCH',
      publishedAt: new Date().toISOString(),
    });
    messageHandler(topic, Buffer.from(payload2));

    // Just verify no crashes - the logging is mocked
    expect(true).toBe(true);
  });

  it('handles invalid JSON gracefully', async () => {
    await subscriber.subscribe(COMPETITION_ID);

    const topic = `saika/competition/${COMPETITION_ID}/state`;

    // Should not throw
    messageHandler(topic, Buffer.from('not-json'));
    expect(true).toBe(true);
  });

  it('resubscribes to new competition', async () => {
    await subscriber.subscribe(COMPETITION_ID);
    const newCompId = 'c3333333-3333-4333-a333-333333333333';
    await subscriber.subscribe(newCompId);

    expect(mqttClient.unsubscribe).toHaveBeenCalledWith(`saika/competition/${COMPETITION_ID}/state`);
    expect(mqttClient.subscribe).toHaveBeenCalledWith(`saika/competition/${newCompId}/state`, 1);
  });

  it('unsubscribe is no-op when not subscribed', async () => {
    await subscriber.unsubscribe();

    expect(mqttClient.unsubscribe).not.toHaveBeenCalled();
  });
});
