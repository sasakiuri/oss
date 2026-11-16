// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

const warn = vi.fn();
vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() }),
}));

import { UnexpectedDisconnectRecorder } from '@/main/modules/connection/application/UnexpectedDisconnectRecorder';
import { Connection } from '@/main/modules/connection/domain/Connection';
import type { IConnectionRepository } from '@/main/modules/connection/domain/IConnectionRepository';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

import { createMockConnectionRepository, createMockEventBus } from '../../../../helpers/mockDependencies';

function connection(portPath: string): Connection {
  return Connection.create({
    manufacturer: TargetManufacturer.kohto(),
    portPath,
    baudRate: 9600,
    deviceId: 'MT201',
  }).connect();
}

const DISCONNECTED = expect.objectContaining({ value: 'DISCONNECTED' });

describe('UnexpectedDisconnectRecorder', () => {
  let connectionRepository: IConnectionRepository;
  let eventBus: IEventBus;
  let recorder: UnexpectedDisconnectRecorder;
  let active: Connection;

  beforeEach(() => {
    warn.mockClear();
    connectionRepository = createMockConnectionRepository();
    eventBus = createMockEventBus();
    recorder = new UnexpectedDisconnectRecorder(connectionRepository, eventBus);
    active = connection('/dev/ttyUSB0');
    vi.mocked(connectionRepository.findActive).mockResolvedValue(active);
  });

  const emittedTypes = (): string[] => vi.mocked(eventBus.emit).mock.calls.map(([event]) => event.type);

  describe('flushBeforeConnect()', () => {
    it('persists the captured disconnected state and announces ConnectionLost', async () => {
      recorder.record();
      await recorder.flushBeforeConnect();

      expect(connectionRepository.save).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ id: active.id, status: DISCONNECTED }),
      );
      expect(eventBus.emit).toHaveBeenCalledExactlyOnceWith({
        type: 'ConnectionLost',
        timestamp: expect.any(Number),
        aggregateId: active.id,
        reason: 'USB device disconnected unexpectedly',
      });
    });

    it('does nothing without an unexpected disconnect', async () => {
      await recorder.flushBeforeConnect();

      expect(connectionRepository.findActive).not.toHaveBeenCalled();
      expect(connectionRepository.save).not.toHaveBeenCalled();
      expect(eventBus.emit).not.toHaveBeenCalled();
    });

    it('finalizes a disconnect only once', async () => {
      recorder.record();
      await recorder.flushBeforeConnect();
      await recorder.flushBeforeConnect();

      expect(connectionRepository.save).toHaveBeenCalledTimes(1);
    });

    it('logs a failed save', async () => {
      vi.mocked(connectionRepository.save).mockRejectedValueOnce(new Error('disk full'));
      recorder.record();

      await expect(recorder.flushBeforeConnect()).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith(
        'Failed to finalize pending unexpected USB disconnect before manual connect',
        'main',
        { err: 'disk full' },
      );
      expect(eventBus.emit).not.toHaveBeenCalled();
    });
  });

  describe('record()', () => {
    it.each([
      ['no active connection', null],
      ['an already disconnected connection', connection('/dev/ttyUSB0').disconnect()],
    ])('captures nothing for %s', async (_, found) => {
      vi.mocked(connectionRepository.findActive).mockResolvedValue(found);
      recorder.record();

      await recorder.flushBeforeConnect();
      expect(connectionRepository.save).not.toHaveBeenCalled();
    });

    it('logs a failed lookup and captures nothing', async () => {
      vi.mocked(connectionRepository.findActive).mockRejectedValue(new Error('db closed'));
      recorder.record();

      await recorder.flushBeforeConnect();
      expect(warn).toHaveBeenCalledWith('Failed to propagate unexpected USB disconnect', 'main', {
        err: 'db closed',
      });
      expect(connectionRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('flushAfterReconnectFailure()', () => {
    it('persists the captured state and announces ConnectionLost', async () => {
      recorder.record();
      await recorder.flushAfterReconnectFailure();

      expect(connectionRepository.save).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ id: active.id, status: DISCONNECTED }),
      );
      expect(emittedTypes()).toEqual(['ConnectionLost']);
    });

    it('logs a failed save', async () => {
      vi.mocked(connectionRepository.save).mockRejectedValueOnce(new Error('disk full'));
      recorder.record();

      await expect(recorder.flushAfterReconnectFailure()).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith('Failed to finalize unexpected USB disconnect', 'main', { err: 'disk full' });
    });
  });

  describe('discard()', () => {
    it('drops the captured state without persisting it', async () => {
      recorder.record();
      await recorder.discard();
      await recorder.flushAfterReconnectFailure();

      expect(connectionRepository.save).not.toHaveBeenCalled();
      expect(eventBus.emit).not.toHaveBeenCalled();
    });
  });

  describe('completeReconnect()', () => {
    it('persists the disconnected state, then the new connection, and re-announces ConnectionEstablished', async () => {
      const reconnected = connection('/dev/ttyUSB1');
      recorder.record();

      await expect(recorder.completeReconnect(reconnected)).resolves.toBe(true);

      expect(vi.mocked(connectionRepository.save).mock.calls).toEqual([
        [expect.objectContaining({ id: active.id, status: DISCONNECTED })],
        [reconnected],
      ]);
      expect(eventBus.emit).toHaveBeenCalledExactlyOnceWith({
        type: 'ConnectionEstablished',
        timestamp: expect.any(Number),
        aggregateId: reconnected.id,
        manufacturer: reconnected.manufacturer,
        portPath: '/dev/ttyUSB1',
        deviceId: 'MT201',
      });
    });

    it('returns false and persists nothing without an unexpected disconnect', async () => {
      await expect(recorder.completeReconnect(connection('/dev/ttyUSB1'))).resolves.toBe(false);

      expect(connectionRepository.save).not.toHaveBeenCalled();
      expect(eventBus.emit).not.toHaveBeenCalled();
    });

    it('consumes the captured state', async () => {
      recorder.record();
      await recorder.completeReconnect(connection('/dev/ttyUSB1'));
      await recorder.flushAfterReconnectFailure();

      expect(emittedTypes()).toEqual(['ConnectionEstablished']);
    });

    it('rejects when persisting fails', async () => {
      vi.mocked(connectionRepository.save).mockRejectedValueOnce(new Error('disk full'));
      recorder.record();

      await expect(recorder.completeReconnect(connection('/dev/ttyUSB1'))).rejects.toThrow('disk full');
    });
  });
});
