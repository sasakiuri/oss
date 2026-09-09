// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';

import { ShotObservationEvidencePublisher } from '@/main/modules/mqtt/application/ShotObservationEvidencePublisher';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import type { IShotObservationEvidenceOutbox } from '@/main/modules/shot-observation/domain/IShotObservationEvidenceOutbox';
import type { ShotObservationEvidence } from '@/main/modules/shot-observation/domain/ShotObservationEvidence';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({ error: vi.fn() }),
}));

const evidence: ShotObservationEvidence = Object.freeze({
  evidenceId: '11111111-1111-4111-8111-111111111111',
  observationId: '22222222-2222-4222-8222-222222222222',
  outcomeId: '11111111-1111-4111-8111-111111111111',
  outcome: 'REJECTED_COMPETITION_PHASE',
  x: 1,
  y: 2,
  deviceScoreX10: 104,
  firedAt: new Date('2026-08-31T01:00:00.000Z'),
  timestampSource: 'LANE_RECEIPT',
  receivedAt: new Date('2026-08-31T01:00:00.010Z'),
  reportedMode: 'MATCH',
  rawFrameHex: 'aabb',
  decidedAt: new Date('2026-08-31T01:00:00.020Z'),
  sessionId: '33333333-3333-4333-8333-333333333333',
  detail: 'phase=SERIES_COMPLETE',
  competition: {
    competitionId: '44444444-4444-4444-8444-444444444444',
    phase: 'SERIES_COMPLETE' as const,
    stageIndex: 1,
    seriesIndex: 5,
    stageScored: true,
  },
});

describe('ShotObservationEvidencePublisher', () => {
  it('publishes pending unscored evidence and acknowledges the outbox only after QoS completion', async () => {
    const pending = [evidence];
    const outbox: IShotObservationEvidenceOutbox = {
      findPending: vi.fn(async () => [...pending]),
      markPublished: vi.fn(async (id) => {
        const index = pending.findIndex((entry) => entry.evidenceId === id);
        if (index >= 0) pending.splice(index, 1);
      }),
    };
    const mqtt = createMqtt();
    const publisher = new ShotObservationEvidencePublisher(mqtt, createEventBus(), createStorage(), outbox);

    await publisher.requestDrain();

    expect(mqtt.publish).toHaveBeenCalledWith(
      'saika/competition/44444444-4444-4444-8444-444444444444/lane/55555555-5555-4555-8555-555555555555/observation',
      expect.any(String),
      { qos: 1, retain: false },
    );
    const payload = JSON.parse(vi.mocked(mqtt.publish).mock.calls[0]![1]);
    expect(payload).toMatchObject({
      evidenceVersion: 1,
      evidenceId: evidence.evidenceId,
      timestampSource: 'LANE_RECEIPT',
      outcome: 'REJECTED_COMPETITION_PHASE',
      competition: { phase: 'SERIES_COMPLETE', stageScored: true },
    });
    expect(outbox.markPublished).toHaveBeenCalledWith(evidence.evidenceId, expect.any(Date));
  });

  it('leaves evidence pending when publication fails', async () => {
    const outbox: IShotObservationEvidenceOutbox = {
      findPending: vi.fn(async () => [evidence]),
      markPublished: vi.fn(),
    };
    const mqtt = createMqtt();
    vi.mocked(mqtt.publish).mockRejectedValue(new Error('offline'));
    const publisher = new ShotObservationEvidencePublisher(mqtt, createEventBus(), createStorage(), outbox);

    await publisher.requestDrain();

    expect(outbox.markPublished).not.toHaveBeenCalled();
  });
});

function createMqtt(): IMqttClientService {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    setWill: vi.fn(),
    onMessage: vi.fn(() => () => undefined),
    onConnect: vi.fn(() => () => undefined),
    onDisconnect: vi.fn(() => () => undefined),
    isConnected: vi.fn(() => true),
  };
}

function createEventBus(): IEventBus {
  return { on: vi.fn(() => () => undefined), emit: vi.fn() } as unknown as IEventBus;
}

function createStorage(): ILocalStorage {
  return {
    get: vi.fn(() => '55555555-5555-4555-8555-555555555555'),
    set: vi.fn(),
    delete: vi.fn(),
    has: vi.fn(),
  } as unknown as ILocalStorage;
}
