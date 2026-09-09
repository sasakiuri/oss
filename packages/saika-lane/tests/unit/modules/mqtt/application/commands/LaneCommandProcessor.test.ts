// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CommandIdempotencyGuard } from '@/main/modules/mqtt/application/commands/CommandIdempotencyGuard';
import { LaneCommandProcessor } from '@/main/modules/mqtt/application/commands/LaneCommandProcessor';
import { CommandAuthorizationPolicy } from '@/main/modules/mqtt/domain/CommandAuthorizationPolicy';
import { ProbeClockCmdSchema, type CommandAckPayload } from '@/main/modules/mqtt/domain/MqttCommandSchemas';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const commandId = 'c3333333-3333-4333-a333-333333333333';
const now = '2026-09-09T00:00:00.000Z';
const command = { commandId, issuedBy: 'director', issuedAt: now, directorSentAt: now };

function setup(policy = new CommandAuthorizationPolicy()) {
  const publications: CommandAckPayload[] = [];
  const mqtt = {
    publish: vi.fn(async (_topic: string, payload: string) => {
      publications.push(JSON.parse(payload));
    }),
  };
  const guard = new CommandIdempotencyGuard();
  const processor = new LaneCommandProcessor(mqtt, guard, policy, () => 'lane', 'test');
  const execute = vi.fn().mockResolvedValue(undefined);
  const request = {
    action: 'probe-clock',
    payload: Buffer.from(JSON.stringify(command)),
    acknowledgementTopic: 'ack',
    schemas: { 'probe-clock': ProbeClockCmdSchema },
    execute,
  };
  return { processor, mqtt, guard, publications, execute, request };
}

describe('LaneCommandProcessor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });
  afterEach(() => vi.useRealTimers());

  it('preserves receipt time, response data, and both authorization and command warnings', async () => {
    const { processor, mqtt, publications, execute, request } = setup(new CommandAuthorizationPolicy('ADVISORY'));
    mqtt.publish.mockImplementationOnce(async (_topic, payload) => {
      publications.push(JSON.parse(payload));
      vi.setSystemTime(Date.parse(now) + 100);
    });
    execute.mockResolvedValue({ sample: 'clock evidence' });
    await processor.handle({ ...request, prepare: () => ({ warning: 'clock_drift_detected' }) });
    expect(execute).toHaveBeenCalledWith('probe-clock', command, new Date(now));
    expect(publications.map((ack) => ack.status)).toEqual(['executing', 'done']);
    expect(publications[1]).toMatchObject({ commandId, laneId: 'lane', data: { sample: 'clock evidence' } });
    expect(publications[1]?.warning).toContain('command_issuer_unverified');
    expect(publications[1]?.warning).toContain('; clock_drift_detected');
    expect(mqtt.publish).toHaveBeenLastCalledWith('ack', expect.any(String), { qos: 1, retain: false });
  });

  it('ignores malformed JSON without executing or acknowledging it', async () => {
    const { processor, publications, execute, request } = setup();
    await processor.handle({ ...request, payload: Buffer.from('{invalid') });
    expect(execute).not.toHaveBeenCalled();
    expect(publications).toEqual([]);
  });

  it.each([null, true, 5, 'text', [], { commandId: 42 }])(
    'rejects invalid payload %j without throwing',
    async (payload) => {
      const { processor, publications, execute, request } = setup();
      await processor.handle({ ...request, payload: Buffer.from(JSON.stringify(payload)) });
      expect(execute).not.toHaveBeenCalled();
      expect(publications).toEqual([
        expect.objectContaining({
          commandId: '',
          status: 'error',
          error: {
            code: 'MQTT_COMMAND_VALIDATION_FAILED',
            message: expect.any(String),
          },
        }),
      ]);
    },
  );

  it.each(['unknown', 'constructor', 'toString', '__proto__'])('rejects unregistered action %s', async (action) => {
    const { processor, publications, execute, request } = setup();
    await processor.handle({ ...request, action });
    expect(execute).not.toHaveBeenCalled();
    expect(publications[0]?.error?.code).toBe('MQTT_UNKNOWN_COMMAND_ACTION');
  });

  it('rejects an unauthorized issuer before consuming the command id', async () => {
    const { processor, publications, execute, request, guard } = setup(
      new CommandAuthorizationPolicy('REQUIRED', ['trusted']),
    );
    await processor.handle(request);
    expect(guard.size).toBe(0);
    expect(execute).not.toHaveBeenCalled();
    expect(publications[0]?.error?.code).toBe('MQTT_COMMAND_UNAUTHORIZED');
    await processor.handle({ ...request, payload: Buffer.from(JSON.stringify({ ...command, issuerId: 'trusted' })) });
    expect(execute).toHaveBeenCalledOnce();
  });

  it('deduplicates a delivery while the first execution is still pending', async () => {
    const { processor, publications, execute, request } = setup();
    let release!: () => void;
    execute.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const first = processor.handle(request);
    await vi.advanceTimersByTimeAsync(0);
    await processor.handle(request);
    expect(execute).toHaveBeenCalledOnce();
    expect(publications.map((ack) => ack.status)).toEqual(['executing']);
    release();
    await first;
    expect(publications.map((ack) => ack.status)).toEqual(['executing', 'done']);
  });

  it('skips untargeted commands without acknowledging them', async () => {
    const { processor, publications, execute, request } = setup();
    await processor.handle({ ...request, prepare: () => ({ skip: true }) });
    expect(execute).not.toHaveBeenCalled();
    expect(publications).toEqual([]);
  });

  it('returns a preparation failure before the executing acknowledgement', async () => {
    const { processor, publications, execute, request } = setup();
    await processor.handle({
      ...request,
      prepare: () => {
        throw ErrorCatalog.createError('MQTT_CLOCK_OUT_OF_SYNC', { driftMs: 31_000 });
      },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(publications.map((ack) => ack.status)).toEqual(['error']);
    expect(publications[0]?.error).toEqual({ code: 'MQTT_CLOCK_OUT_OF_SYNC', message: expect.any(String) });
  });

  it.each([new Error('execution failed'), null, 'execution failed'])(
    'contains execution failure %j',
    async (failure) => {
      const { processor, publications, execute, request } = setup();
      execute.mockRejectedValue(failure);
      await processor.handle(request);
      expect(publications.map((ack) => ack.status)).toEqual(['executing', 'error']);
      expect(publications[1]?.error?.code).toBe('MQTT_COMMAND_EXECUTION_FAILED');
    },
  );

  it('continues execution when acknowledgement publication fails', async () => {
    const { processor, mqtt, execute, request } = setup();
    mqtt.publish.mockRejectedValue(new Error('broker unavailable'));
    await expect(processor.handle(request)).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledOnce();
    expect(mqtt.publish).toHaveBeenCalledTimes(2);
  });
});
