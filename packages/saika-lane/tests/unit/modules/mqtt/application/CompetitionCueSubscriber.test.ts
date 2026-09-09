// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { CompetitionCueSubscriber } from '@/main/modules/mqtt/application/CompetitionCueSubscriber';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const LANE_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_LANE_ID = '33333333-3333-4333-8333-333333333333';

function cue(targetLaneIds?: string[]) {
  return {
    schemaVersion: 1,
    competitionId: COMPETITION_ID,
    runId: '44444444-4444-4444-8444-444444444444',
    cueId: '55555555-5555-4555-8555-555555555555',
    confirmationEntryId: '55555555-5555-4555-8555-555555555555',
    branch: 'MAIN',
    iteration: 0,
    stepId: 'final.start',
    actor: 'CRO',
    kind: 'COMMAND',
    text: 'START',
    ruleReference: '6.17.2',
    effect: { type: 'OPEN_FIRING', purpose: 'MATCH' },
    ...(targetLaneIds ? { targetLaneIds } : {}),
    publishedAt: new Date().toISOString(),
  };
}

describe('CompetitionCueSubscriber', () => {
  let mqttClient: IMqttClientService;
  let messageHandler: (topic: string, payload: Buffer) => void;
  let eventBus: TypedEventBus;
  let changed: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mqttClient = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      publish: vi.fn(),
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      setWill: vi.fn(),
      onMessage: vi.fn().mockImplementation((handler: typeof messageHandler) => {
        messageHandler = handler;
        return () => undefined;
      }),
      onConnect: vi.fn(),
      onDisconnect: vi.fn(),
      isConnected: vi.fn().mockReturnValue(true),
    };
    eventBus = new TypedEventBus();
    changed = vi.fn();
    eventBus.on('CompetitionCueChanged', changed);
  });

  it('emits a valid retained cue for this Lane', async () => {
    const subscriber = new CompetitionCueSubscriber(mqttClient, eventBus, () => LANE_ID);
    await subscriber.subscribe(COMPETITION_ID);
    messageHandler(`saika/competition/${COMPETITION_ID}/cue`, Buffer.from(JSON.stringify(cue())));

    expect(changed).toHaveBeenLastCalledWith(
      expect.objectContaining({ aggregateId: COMPETITION_ID, cue: expect.objectContaining({ text: 'START' }) }),
    );
  });

  it('projects a targeted cue as cleared on an ineligible Lane', async () => {
    const subscriber = new CompetitionCueSubscriber(mqttClient, eventBus, () => LANE_ID);
    await subscriber.subscribe(COMPETITION_ID);
    messageHandler(`saika/competition/${COMPETITION_ID}/cue`, Buffer.from(JSON.stringify(cue([OTHER_LANE_ID]))));

    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ cue: null }));
  });

  it('forwards Director timed-target cues through the shared contract', async () => {
    const subscriber = new CompetitionCueSubscriber(mqttClient, eventBus, () => LANE_ID);
    await subscriber.subscribe(COMPETITION_ID);
    const payload = { ...cue(), effect: { type: 'RUN_TIMED_TARGET', purpose: 'MATCH' } };
    messageHandler(`saika/competition/${COMPETITION_ID}/cue`, Buffer.from(JSON.stringify(payload)));

    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ cue: payload }));
  });

  it('clears renderer state when the competition subscription ends', async () => {
    const subscriber = new CompetitionCueSubscriber(mqttClient, eventBus, () => LANE_ID);
    await subscriber.subscribe(COMPETITION_ID);
    await subscriber.unsubscribe();

    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ aggregateId: COMPETITION_ID, cue: null }));
  });
});
