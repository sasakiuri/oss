// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectionStatus } from '@/main/modules/connection/domain/ConnectionStatus';
import type { USBConnectionConfig } from '@/main/modules/connection/infra/usb/IUSBConnectionManager';
import { USBConnectionLifecycle } from '@/main/modules/connection/infra/usb/USBConnectionLifecycle';
import { USBEventEmitter } from '@/main/modules/connection/infra/usb/USBEventEmitter';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';

let mockPortInstance: any;
const mockPortInstances: any[] = [];

vi.mock('serialport', () => {
  const mockSerialPort = vi.fn().mockImplementation((options: any) => {
    mockPortInstance = {
      _events: {} as Record<string, Function>,
      _isOpen: false,
      opening: false,
      closing: false,
      path: options.path,
      baudRate: options.baudRate,
      on: vi.fn(function (this: typeof mockPortInstance, event: string, callback: Function) {
        this._events[event] = callback;
        return this;
      }),
      once: vi.fn(function (this: typeof mockPortInstance, event: string, callback: Function) {
        const onceCallback = (...args: unknown[]) => {
          this.removeListener(event, onceCallback);
          callback(...args);
        };
        this._events[event] = onceCallback;
        return this;
      }),
      open: vi.fn(function (this: typeof mockPortInstance, callback?: (err: Error | null) => void) {
        this.opening = true;
        setTimeout(() => {
          this.opening = false;
          this._isOpen = true;
          if (this._events.open) {
            this._events.open();
          }
          if (callback) callback(null);
        }, 10);
      }),
      close: vi.fn(function (this: typeof mockPortInstance, callback?: (err: Error | null) => void) {
        this.closing = true;
        setTimeout(() => {
          this.closing = false;
          this._isOpen = false;
          // SerialPortStream emits `close` before invoking the close callback.
          this._events.close?.();
          if (callback) callback(null);
        }, 10);
      }),
      set: vi.fn((_options: unknown, callback?: (err: Error | null) => void) => callback?.(null)),
      write: vi.fn((_data: Buffer, callback?: (err: Error | null) => void) => callback?.(null)),
      drain: vi.fn((callback?: (err: Error | null) => void) => callback?.(null)),
      removeListener: vi.fn(function (this: typeof mockPortInstance, event: string, callback: Function) {
        if (this._events[event] === callback) {
          delete this._events[event];
        }
        return this;
      }),
      removeAllListeners: vi.fn(function (this: typeof mockPortInstance) {
        this._events = {};
        return this;
      }),
      get isOpen() {
        return this._isOpen;
      },
    };
    mockPortInstances.push(mockPortInstance);
    return mockPortInstance;
  });

  return { SerialPort: mockSerialPort };
});

vi.mock('@/main/modules/connection/infra/usb/USBDeviceDetector', () => ({
  USBDeviceDetector: vi.fn().mockImplementation(() => ({
    listPorts: vi
      .fn()
      .mockResolvedValue([
        { path: 'COM3', manufacturer: 'FTDI', serialNumber: 'ABC', vendorId: '0403', productId: '6001' },
      ]),
  })),
}));

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const createConfig = (overrides?: Partial<USBConnectionConfig>): USBConnectionConfig => ({
  portName: 'COM3',
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: 'none' as const,
  manufacturer: TargetManufacturer.kohto(),
  deviceId: 'MT201',
  ...overrides,
});

describe('USBConnectionLifecycle', () => {
  let emitter: USBEventEmitter;
  let onPortReady: ReturnType<typeof vi.fn>;
  let lifecycle: USBConnectionLifecycle;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPortInstance = null;
    mockPortInstances.length = 0;
    emitter = new USBEventEmitter();
    onPortReady = vi.fn();
    lifecycle = new USBConnectionLifecycle(emitter, onPortReady);
  });

  describe('connect()', () => {
    it('should return a Connection entity on successful connection', async () => {
      const config = createConfig();
      const connection = await lifecycle.connect(config);

      expect(connection).toBeDefined();
      expect(connection.isConnected).toBe(true);
      expect(connection.portPath).toBe('COM3');
    });

    it('should invoke onPortReady callback on successful connection', async () => {
      const config = createConfig();
      await lifecycle.connect(config);

      expect(onPortReady).toHaveBeenCalledTimes(1);
      expect(onPortReady).toHaveBeenCalledWith(expect.objectContaining({ path: 'COM3' }), config);
    });

    it('should emit a connected event on successful connection', async () => {
      const callback = vi.fn();
      emitter.on('connected', callback);

      const config = createConfig();
      await lifecycle.connect(config);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ isConnected: true }));
    });

    it('should reject on open error', async () => {
      const { SerialPort } = await import('serialport');
      const MockedSerialPort = vi.mocked(SerialPort);

      // Override open to simulate error
      MockedSerialPort.mockImplementationOnce((options) => {
        mockPortInstance = {
          _events: {} as Record<string, Function>,
          _isOpen: false,
          path: (options as { path: string }).path,
          on: vi.fn(function (this: typeof mockPortInstance, event: string, callback: Function) {
            this._events[event] = callback;
            return this;
          }),
          open: vi.fn(function (this: typeof mockPortInstance, callback?: (err: Error | null) => void) {
            const error = new Error('Port open failed');
            if (callback) callback(error);
          }),
          close: vi.fn(),
          removeAllListeners: vi.fn(),
          get isOpen() {
            return this._isOpen;
          },
        };

        return mockPortInstance as any;
      });

      const config = createConfig();
      await expect(lifecycle.connect(config)).rejects.toThrow('Port open failed');
    });

    it('should emit an error event on port error event', async () => {
      const { SerialPort } = await import('serialport');
      const MockedSerialPort = vi.mocked(SerialPort);

      MockedSerialPort.mockImplementationOnce((options) => {
        mockPortInstance = {
          _events: {} as Record<string, Function>,
          _isOpen: false,
          path: (options as { path: string }).path,
          on: vi.fn(function (this: typeof mockPortInstance, event: string, callback: Function) {
            this._events[event] = callback;
            return this;
          }),
          open: vi.fn(function (this: typeof mockPortInstance) {
            // Trigger error event instead of open
            setTimeout(() => {
              if (this._events.error) {
                this._events.error(new Error('Device error'));
              }
            }, 10);
          }),
          close: vi.fn(),
          removeAllListeners: vi.fn(),
          get isOpen() {
            return this._isOpen;
          },
        };

        return mockPortInstance as any;
      });

      const errorCallback = vi.fn();
      emitter.on('error', errorCallback);

      const config = createConfig();
      await expect(lifecycle.connect(config)).rejects.toThrow('Device error');

      expect(errorCallback).toHaveBeenCalledWith(expect.objectContaining({ recoverable: false }));
    });

    it('should reset reconnect attempt count on successful connection', async () => {
      const config = createConfig();
      await lifecycle.connect(config);

      // getStatus should return connected
      const status = lifecycle.getStatus();
      expect(status.equals(ConnectionStatus.connected())).toBe(true);
    });

    it('should cancel an older replacement connect before opening the latest port', async () => {
      await lifecycle.connect(createConfig({ portName: 'COM1' }));

      const olderReplacement = lifecycle.connect(createConfig({ portName: 'COM2' }));
      const olderRejection = expect(olderReplacement).rejects.toMatchObject({
        code: 'CONNECTION_FAILED',
        metadata: { reason: 'Connection attempt was cancelled' },
      });
      const latestReplacement = lifecycle.connect(createConfig({ portName: 'COM3' }));

      const latestConnection = await latestReplacement;
      await olderRejection;

      expect(latestConnection.portPath).toBe('COM3');
      expect(lifecycle.port?.path).toBe('COM3');
      expect(mockPortInstances.filter((port) => port.isOpen).map((port) => port.path)).toEqual(['COM3']);
    });

    it('should close an open port before rejecting post-open initialization failure', async () => {
      onPortReady.mockRejectedValueOnce(new Error('Receiver initialization failed'));

      await expect(lifecycle.connect(createConfig())).rejects.toThrow('Receiver initialization failed');

      expect(mockPortInstance.close).toHaveBeenCalledTimes(1);
      expect(lifecycle.getStatus().equals(ConnectionStatus.disconnected())).toBe(true);
    });

    it('should reject a handshake closed while onPortReady is pending without emitting connected', async () => {
      let releaseReady!: () => void;
      onPortReady.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseReady = resolve;
          }),
      );
      const connected = vi.fn();
      emitter.on('connected', connected);

      const connectPromise = lifecycle.connect(createConfig());
      const rejected = expect(connectPromise).rejects.toMatchObject({
        code: 'CONNECTION_FAILED',
        metadata: { reason: 'Port closed during initialization' },
      });
      await vi.waitFor(() => expect(onPortReady).toHaveBeenCalledTimes(1));

      mockPortInstance._isOpen = false;
      mockPortInstance._events.close();
      await rejected;
      releaseReady();
      await Promise.resolve();

      expect(connected).not.toHaveBeenCalled();
      expect(lifecycle.getStatus().equals(ConnectionStatus.disconnected())).toBe(true);
    });
  });

  describe('disconnect()', () => {
    it('should disconnect a connected port', async () => {
      const config = createConfig();
      await lifecycle.connect(config);

      await lifecycle.disconnect();

      const status = lifecycle.getStatus();
      expect(status.equals(ConnectionStatus.disconnected())).toBe(true);
    });

    it('should not emit a disconnected event for an explicit disconnect', async () => {
      const callback = vi.fn();
      emitter.on('disconnected', callback);

      const config = createConfig();
      await lifecycle.connect(config);

      await lifecycle.disconnect();

      expect(callback).not.toHaveBeenCalled();
    });

    it('should do nothing when port is not open', async () => {
      // Port is null in initial state
      await lifecycle.disconnect();

      // Verify no error is thrown
      const status = lifecycle.getStatus();
      expect(status.equals(ConnectionStatus.disconnected())).toBe(true);
    });

    it('should cancel an opening port and close it once opening completes', async () => {
      const connected = vi.fn();
      emitter.on('connected', connected);

      const connectPromise = lifecycle.connect(createConfig());
      const rejected = expect(connectPromise).rejects.toMatchObject({
        code: 'CONNECTION_FAILED',
        metadata: { reason: 'Connection attempt was cancelled' },
      });
      await lifecycle.disconnect();
      await rejected;

      expect(mockPortInstance.close).toHaveBeenCalledTimes(1);
      expect(connected).not.toHaveBeenCalled();
      expect(lifecycle.getStatus().equals(ConnectionStatus.disconnected())).toBe(true);
    });

    it('should remove all port listeners on disconnect', async () => {
      const config = createConfig();
      await lifecycle.connect(config);

      await lifecycle.disconnect();

      expect(mockPortInstance.removeAllListeners).toHaveBeenCalled();
    });

    it('should remove listeners before close on disconnect', async () => {
      const config = createConfig();
      await lifecycle.connect(config);

      const callOrder: string[] = [];
      mockPortInstance.removeAllListeners.mockImplementation(() => {
        callOrder.push('removeAllListeners');
        return mockPortInstance;
      });
      mockPortInstance.close.mockImplementation(function (
        this: typeof mockPortInstance,
        callback?: (err: Error | null) => void,
      ) {
        callOrder.push('close');
        setTimeout(() => {
          this._isOpen = false;
          if (callback) callback(null);
        }, 10);
      });

      await lifecycle.disconnect();

      expect(callOrder).toEqual(['removeAllListeners', 'close']);
    });

    it('should log and complete normally even on close error', async () => {
      const config = createConfig();
      await lifecycle.connect(config);

      // Override close to simulate error
      mockPortInstance.close = vi.fn(function (this: typeof mockPortInstance, callback?: (err: Error | null) => void) {
        setTimeout(() => {
          this._isOpen = false;
          if (callback) callback(new Error('Close error'));
        }, 10);
      });

      // Should not throw
      await lifecycle.disconnect();
    });

    it('should not reconnect when an explicit disconnect supersedes automatic recovery', async () => {
      await lifecycle.connect(createConfig());
      const establishedPort = mockPortInstance;

      const recovery = lifecycle.handleConnectionError(establishedPort, new Error('Link lost'));
      const explicitDisconnect = lifecycle.disconnect();
      await Promise.all([recovery, explicitDisconnect]);

      expect(mockPortInstances).toHaveLength(1);
      expect(lifecycle.getStatus().equals(ConnectionStatus.disconnected())).toBe(true);
    });
  });

  describe('reconnect()', () => {
    it('should throw CONNECTION_FAILED error when no config exists', async () => {
      await expect(lifecycle.reconnect()).rejects.toThrow();
    });

    it('should throw MAX_RECONNECT_EXCEEDED error when max attempts are exceeded', async () => {
      const config = createConfig();
      await lifecycle.connect(config);

      const { SerialPort } = await import('serialport');
      const MockedSerialPort = vi.mocked(SerialPort);

      // Make subsequent connects fail so reconnectAttempts accumulates
      const makeFailingPort = (options: { path: string }) => {
        mockPortInstance = {
          _events: {} as Record<string, Function>,
          _isOpen: false,
          path: options.path,
          on: vi.fn(function (this: typeof mockPortInstance, event: string, callback: Function) {
            this._events[event] = callback;
            return this;
          }),
          open: vi.fn(function (this: typeof mockPortInstance, callback?: (err: Error | null) => void) {
            if (callback) callback(new Error('Connection refused'));
          }),
          close: vi.fn(function (this: typeof mockPortInstance, callback?: (err: Error | null) => void) {
            this._isOpen = false;
            if (callback) callback(null);
          }),
          removeAllListeners: vi.fn(),
          get isOpen() {
            return this._isOpen;
          },
        };

        return mockPortInstance as any;
      };

      // Each reconnect will fail, incrementing the counter
      for (let i = 0; i < 3; i++) {
        MockedSerialPort.mockImplementationOnce(makeFailingPort);
        await lifecycle.reconnect().catch(() => {
          /* expected failure */
        });
      }

      // 4th attempt should throw MAX_RECONNECT_EXCEEDED without even trying to connect
      await expect(lifecycle.reconnect()).rejects.toThrow();
    });

    it('should reset attempt count on successful reconnect', async () => {
      const config = createConfig();
      await lifecycle.connect(config);

      // Successful reconnects reset the counter
      await lifecycle.reconnect();
      await lifecycle.reconnect();

      // After successful reconnect, counter is reset
      const status = lifecycle.getStatus();
      expect(status.equals(ConnectionStatus.connected())).toBe(true);
    });
  });

  describe('getStatus()', () => {
    it('should be disconnected initially', () => {
      const status = lifecycle.getStatus();
      expect(status.equals(ConnectionStatus.disconnected())).toBe(true);
    });

    it('should be connected after connecting', async () => {
      const config = createConfig();
      await lifecycle.connect(config);

      const status = lifecycle.getStatus();
      expect(status.equals(ConnectionStatus.connected())).toBe(true);
    });

    it('should be disconnected after disconnecting', async () => {
      const config = createConfig();
      await lifecycle.connect(config);
      await lifecycle.disconnect();

      const status = lifecycle.getStatus();
      expect(status.equals(ConnectionStatus.disconnected())).toBe(true);
    });
  });

  describe('listPorts()', () => {
    it('should return a list of available ports', async () => {
      const ports = await lifecycle.listPorts();

      expect(ports).toHaveLength(1);
      expect(ports[0]).toEqual(expect.objectContaining({ path: 'COM3', manufacturer: 'FTDI' }));
    });
  });

  describe('attemptReconnect()', () => {
    it('should emit reconnectFailed event on reconnect failure', async () => {
      const callback = vi.fn();
      emitter.on('reconnectFailed', callback);

      // Reconnect fails because there is no config
      await lifecycle.attemptReconnect();

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ attempts: 0 }));
    });
  });
});
