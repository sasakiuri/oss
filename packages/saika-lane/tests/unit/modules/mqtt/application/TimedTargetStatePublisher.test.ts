// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';

import { TimedTargetStatePublisher } from '@/main/modules/mqtt/application/TimedTargetStatePublisher';
import type { IMqttClientService } from '@/main/modules/mqtt/infra/IMqttClientService';
import type { ITimedTargetControl, TimedTargetState } from '@/main/modules/timed-target';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

const laneId = '11111111-1111-4111-8111-111111111111';
const competitionId = '22222222-2222-4222-8222-222222222222';

function state(): TimedTargetState {
  return {
    sequenceId: '33333333-3333-4333-8333-333333333333',
    competitionId,
    programId: 'P25_MATCH_RAPID_3_7',
    programLabel: 'Rapid-fire competition series',
    purpose: 'MATCH',
    stageIndex: 2,
    seriesIndex: 0,
    targetProfileId: 'ISSF_PISTOL_25M_RAPID_FIRE_2026',
    ruleReference: '6.4.12(c), 6.4.13, 8.7.6.4(i)',
    phase: 'FIRING',
    signal: 'GREEN',
    shotWindowOpen: true,
    exposureIndex: 0,
    exposureCount: 5,
    acceptedShotsInExposure: 0,
    loadAt: new Date('2026-09-03T00:00:00.000Z'),
    attentionAt: new Date('2026-09-03T00:01:00.000Z'),
    completesAt: new Date('2026-09-03T00:01:50.700Z'),
    nextLoadAllowedAt: new Date('2026-09-03T00:02:50.700Z'),
    nextTransitionAt: new Date('2026-09-03T00:01:10.100Z'),
    terminalReason: null,
  };
}

describe('TimedTargetStatePublisher', () => {
  it('publishes the durable Lane projection on a retained competition topic', async () => {
    const mqtt = {
      isConnected: vi.fn().mockReturnValue(true),
      publish: vi.fn().mockResolvedValue(undefined),
    } as unknown as IMqttClientService;
    const eventBus = { on: vi.fn() } as unknown as IEventBus;
    const control = {
      enforcementMode: 'REQUIRED',
      getState: vi.fn().mockReturnValue(state()),
    } as unknown as ITimedTargetControl;
    const publisher = new TimedTargetStatePublisher(
      mqtt,
      eventBus,
      { get: vi.fn().mockReturnValue(laneId) } as unknown as ILocalStorage,
      control,
    );

    await publisher.publishCurrentState(competitionId);

    expect(control.getState).toHaveBeenCalledWith(competitionId);
    expect(mqtt.publish).toHaveBeenCalledWith(
      `saika/competition/${competitionId}/lane/${laneId}/timed-target/state`,
      expect.any(String),
      { qos: 1, retain: true },
    );
    const payload = JSON.parse(vi.mocked(mqtt.publish).mock.calls[0]?.[1] as string);
    expect(payload).toMatchObject({
      schemaVersion: 1,
      laneId,
      competitionId,
      phase: 'FIRING',
      signal: 'GREEN',
      enforcementMode: 'REQUIRED',
    });
  });

  it('does not publish while disconnected so reconnect can replay persisted state', async () => {
    const mqtt = {
      isConnected: vi.fn().mockReturnValue(false),
      publish: vi.fn(),
    } as unknown as IMqttClientService;
    const publisher = new TimedTargetStatePublisher(
      mqtt,
      { on: vi.fn() } as unknown as IEventBus,
      { get: vi.fn().mockReturnValue(laneId) } as unknown as ILocalStorage,
      {
        enforcementMode: 'ADVISORY',
        getState: vi.fn().mockReturnValue(state()),
      } as unknown as ITimedTargetControl,
    );

    await publisher.publishCurrentState();

    expect(mqtt.publish).not.toHaveBeenCalled();
  });
});
