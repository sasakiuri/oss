// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MqttCommandDispatcher,
  type PublishCommandOptions,
} from '@/main/modules/mqtt/application/MqttCommandDispatcher';
import type { CommandAcknowledgement } from '@/shared/mqtt';

function setup() {
  const publish = vi.fn(async () => {});
  const callbacks = { onCompleted: vi.fn(), onProgress: vi.fn(), onError: vi.fn(), onDebugLog: vi.fn() };
  const dispatcher = new MqttCommandDispatcher({ publish }, 1000, callbacks);
  const options: PublishCommandOptions = {
    action: 'start-match',
    topic: 'competition/command/start-match',
    acknowledgementTopic: (laneId) => `ack/${laneId}`,
    payload: { commandId: 'command-1' },
    expectedLaneIds: ['lane-1', 'lane-2'],
  };
  return { dispatcher, options, publish, callbacks };
}

function acknowledgement(laneId: string, status: CommandAcknowledgement['status'] = 'done'): CommandAcknowledgement {
  return { commandId: 'command-1', laneId, status, acknowledgedAt: new Date().toISOString() };
}

describe('MqttCommandDispatcher', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('correlates the full topic and lane, and preserves the first terminal acknowledgement', async () => {
    const { dispatcher, options, callbacks } = setup();
    const result = dispatcher.publish(options);
    dispatcher.acknowledge('wrong-topic', acknowledgement('lane-1'));
    dispatcher.acknowledge('ack/stranger', acknowledgement('stranger'));
    dispatcher.acknowledge('ack/lane-1', { ...acknowledgement('lane-1'), commandId: 'other-command' });
    expect(callbacks.onProgress).not.toHaveBeenCalled();
    dispatcher.acknowledge('ack/lane-1', acknowledgement('lane-1', 'executing'));
    dispatcher.acknowledge('ack/lane-1', acknowledgement('lane-1'));
    dispatcher.acknowledge('ack/lane-1', acknowledgement('lane-1', 'error'));
    expect(callbacks.onCompleted).not.toHaveBeenCalled();
    dispatcher.acknowledge('ack/lane-2', acknowledgement('lane-2'));
    await expect(result).resolves.toMatchObject({ success: true, lanes: [{ status: 'done' }, { status: 'done' }] });
    expect(callbacks.onCompleted).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out executing and missing lanes even when broker publication never settles', async () => {
    const { dispatcher, options, publish, callbacks } = setup();
    let rejectPublish!: (error: Error) => void;
    publish.mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectPublish = reject;
        }),
    );
    const result = dispatcher.publish(options);
    dispatcher.acknowledge('ack/lane-1', acknowledgement('lane-1', 'executing'));
    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toMatchObject({
      success: false,
      lanes: [{ status: 'timeout' }, { status: 'timeout' }],
    });
    const error = new Error('late broker failure');
    rejectPublish(error);
    await vi.advanceTimersByTimeAsync(0);
    expect(callbacks.onError).toHaveBeenCalledWith(error);
    dispatcher.acknowledge('ack/lane-1', acknowledgement('lane-1'));
    expect(callbacks.onCompleted).toHaveBeenCalledOnce();
  });

  it('cancels pending commands while retaining completed lane outcomes', async () => {
    const { dispatcher, options } = setup();
    const result = dispatcher.publish(options);
    dispatcher.acknowledge('ack/lane-1', acknowledgement('lane-1'));
    dispatcher.cancelPending();
    await expect(result).resolves.toMatchObject({ success: false, lanes: [{ status: 'done' }, { status: 'timeout' }] });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['finish-competition', 'COMPETITION_ALREADY_FINISHED'],
    ['leave-competition', 'MQTT_NOT_IN_COMPETITION'],
  ] as const)('preserves idempotent success for %s', async (action, code) => {
    const { dispatcher, options } = setup();
    const result = dispatcher.publish({ ...options, action, expectedLaneIds: ['lane-1', 'lane-1'] });
    dispatcher.acknowledge('ack/lane-1', {
      ...acknowledgement('lane-1', 'error'),
      error: { code, message: 'already complete' },
    });
    await expect(result).resolves.toMatchObject({
      success: true,
      lanes: [{ status: 'done', warning: 'already complete' }],
    });
  });

  it('cleans up its deadline when publishing fails', async () => {
    const { dispatcher, options, publish, callbacks } = setup();
    publish.mockRejectedValue(new Error('broker failure'));
    await expect(dispatcher.publish(options)).rejects.toThrow('broker failure');
    dispatcher.cancelPending();
    expect(callbacks.onCompleted).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('completes a command without participants only after the broker accepts publication', async () => {
    const { dispatcher, options, callbacks } = setup();
    const onPublished = vi.fn();
    await expect(dispatcher.publish({ ...options, expectedLaneIds: [], onPublished })).resolves.toMatchObject({
      success: true,
      lanes: [],
    });
    expect(onPublished).toHaveBeenCalledOnce();
    expect(callbacks.onCompleted).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
