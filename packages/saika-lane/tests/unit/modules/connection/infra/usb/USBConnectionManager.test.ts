// SPDX-License-Identifier: MIT
import { SerialPort } from 'serialport';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectionStatus } from '@/main/modules/connection/domain/ConnectionStatus';
import type { USBConnectionConfig } from '@/main/modules/connection/infra/usb/IUSBConnectionManager';
import { USBConnectionManager } from '@/main/modules/connection/infra/usb/USBConnectionManager';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { Mode } from '@/main/modules/session/domain/Mode';
import { DisagAdapter } from '@/main/modules/target/adapters/DisagAdapter';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import { AdapterRegistry } from '@/main/modules/target/infra/AdapterRegistry';

import { validRedDotFrame, validRedDotPistolFrame } from '../../../../../helpers/redDotFixtures';

// Mock Electron
vi.mock('electron', () => ({
  app: { isPackaged: false },
}));

// Mock SerialPort instance
let mockPortInstance: any;
const mockPortInstances: any[] = [];

// Mock serialport
vi.mock('serialport', () => {
  const mockSerialPort = vi.fn().mockImplementation((options: any) => {
    mockPortInstance = {
      _events: {},
      _isOpen: false,
      opening: false,
      closing: false,
      path: options.path,
      baudRate: options.baudRate,
      on: vi.fn(function (this: any, event: string, callback: Function) {
        this._events[event] = callback;
        return this;
      }),
      open: vi.fn(function (this: any, callback?: Function) {
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
      close: vi.fn(function (this: any, callback?: Function) {
        this.closing = true;
        setTimeout(() => {
          this.closing = false;
          this._isOpen = false;
          if (callback) callback(null);
        }, 10);
      }),
      set: vi.fn((_options: unknown, callback?: Function) => callback?.(null)),
      write: vi.fn((_data: Buffer, callback?: Function) => callback?.(null)),
      drain: vi.fn((callback?: Function) => callback?.(null)),
      removeListener: vi.fn(function (this: any, event: string, callback: Function) {
        if (this._events[event] === callback) {
          delete this._events[event];
        }
        return this;
      }),
      removeAllListeners: vi.fn(function (this: any, event?: string) {
        if (event === undefined) {
          this._events = {};
        } else {
          delete this._events[event];
        }
        return this;
      }),
      get isOpen() {
        return this._isOpen;
      },
      set isOpen(value: boolean) {
        this._isOpen = value;
      },
    };
    mockPortInstances.push(mockPortInstance);
    return mockPortInstance;
  });

  return {
    SerialPort: mockSerialPort,
  };
});

// Mock USBDeviceDetector
vi.mock('@/main/modules/connection/infra/usb/USBDeviceDetector', () => ({
  USBDeviceDetector: vi.fn().mockImplementation(() => ({
    listPorts: vi.fn().mockResolvedValue([
      {
        path: 'COM3',
        manufacturer: 'FTDI',
        serialNumber: 'ABC123',
        vendorId: '0403',
        productId: '6001',
      },
      {
        path: 'COM4',
        manufacturer: 'Prolific',
        serialNumber: 'DEF456',
        vendorId: '067b',
        productId: '2303',
      },
    ]),
  })),
}));

// Mock SerialDataParser
vi.mock('@/main/modules/target/infra/SerialDataParser', () => {
  const MockSerialDataParser = Object.assign(
    vi.fn().mockImplementation(() => ({
      parse: vi.fn().mockReturnValue([]),
      clearBuffer: vi.fn(),
    })),
    { defaultParsers: vi.fn().mockReturnValue({}) },
  );
  return { SerialDataParser: MockSerialDataParser };
});

// Mock Logger
vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: vi.fn().mockReturnValue({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    isLevelEnabled: vi.fn().mockReturnValue(true),
  }),
}));

describe('USBConnectionManager', () => {
  let manager: USBConnectionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPortInstance = null;
    mockPortInstances.length = 0;
    manager = new USBConnectionManager(new AdapterRegistry());
    manager.setSessionContextProvider(() => ({
      discipline: Discipline.airRifle10m(),
      mode: Mode.sighting(),
    }));
  });

  afterEach(async () => {
    await manager.disconnect();
  });

  describe('connect()', () => {
    it('should connect successfully', async () => {
      const config: USBConnectionConfig = {
        portName: 'COM3',
        manufacturer: TargetManufacturer.custom(),
        baudRate: 9600,
      };

      const connection = await manager.connect(config);

      expect(connection).toBeDefined();
      expect(connection.portPath).toBe('COM3');
      expect(connection.baudRate).toBe(9600);
      expect(connection.manufacturer.equals(config.manufacturer)).toBe(true);
      expect(connection.isConnected).toBe(true);
      expect(SerialPort).toHaveBeenCalledTimes(1);
    });

    it('should apply default connection settings correctly', async () => {
      const config: USBConnectionConfig = {
        portName: 'COM3',
        manufacturer: TargetManufacturer.sius(),
      };

      await manager.connect(config);

      expect(SerialPort).toHaveBeenCalledWith(
        expect.objectContaining({
          baudRate: 9600,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
        }),
      );
    });

    it('should apply custom connection settings correctly', async () => {
      const config: USBConnectionConfig = {
        portName: 'COM3',
        manufacturer: TargetManufacturer.custom(),
        baudRate: 115200,
        dataBits: 7,
        stopBits: 2,
        parity: 'even',
      };

      await manager.connect(config);

      expect(SerialPort).toHaveBeenCalledWith(
        expect.objectContaining({
          baudRate: 115200,
          dataBits: 7,
          stopBits: 2,
          parity: 'even',
        }),
      );
    });

    it('should start RedDot polling with ENQ and never send S/R mode commands', async () => {
      const config: USBConnectionConfig = {
        portName: 'COM3',
        manufacturer: TargetManufacturer.disag(),
        deviceId: 'DISAG_KT_RDT_ZIE_1_RIFLE',
        baudRate: 9600,
      };

      await manager.connect(config);
      await manager.sendMode(Mode.sighting());
      await manager.sendMode(Mode.match());

      expect(mockPortInstance.set).toHaveBeenCalledWith({ dtr: false, rts: false }, expect.any(Function));
      expect(mockPortInstance.write).toHaveBeenCalledTimes(1);
      expect(mockPortInstance.write.mock.calls[0]![0]).toEqual(Buffer.from([0x05]));
    });

    it('should ACK a split RedDot frame and emit one existing shot event without idle sounds', async () => {
      const registry = new AdapterRegistry();
      registry.registerAdapter('DISAG', new DisagAdapter());
      registry.assignDeviceAdapter('DISAG_KT_RDT_ZIE_1_RIFLE', 'DISAG');
      manager = new USBConnectionManager(registry);
      manager.setSessionContextProvider(() => ({
        discipline: Discipline.airRifle10m(),
        mode: Mode.sighting(),
      }));
      const sound = vi.fn();
      const data = vi.fn();
      manager.setOnShotDetected(sound);
      manager.on('data', data);
      await manager.connect({
        portName: 'COM3',
        manufacturer: TargetManufacturer.disag(),
        deviceId: 'DISAG_KT_RDT_ZIE_1_RIFLE',
      });

      mockPortInstance._events.data(Buffer.from([0x15]));
      await flushPromises();
      expect(sound).not.toHaveBeenCalled();

      const frame = validRedDotFrame();
      mockPortInstance._events.data(frame.subarray(0, 20));
      await flushPromises();
      expect(sound).not.toHaveBeenCalled();

      mockPortInstance._events.data(frame.subarray(20));
      await flushPromises();

      expect(mockPortInstance.write.mock.calls.map((call: unknown[]) => call[0])).toEqual([
        Buffer.from([0x05]),
        Buffer.from([0x06]),
      ]);
      expect(sound).toHaveBeenCalledTimes(1);
      expect(data).toHaveBeenCalledTimes(1);
      expect(data).toHaveBeenCalledWith(expect.objectContaining({ x: 3, y: 4, score: 90, mode: 'SIGHTING' }));
    });

    it('should use the shared RedDot protocol for the ISSF_AP_10M pistol profile', async () => {
      const registry = new AdapterRegistry();
      registry.registerAdapter('DISAG', new DisagAdapter());
      registry.assignDeviceAdapter('DISAG_KT_RDT_ZIE_1_PISTOL', 'DISAG');
      manager = new USBConnectionManager(registry);
      manager.setSessionContextProvider(() => ({
        discipline: Discipline.airPistol10m(),
        mode: Mode.match(),
      }));
      const sound = vi.fn();
      const data = vi.fn();
      manager.setOnShotDetected(sound);
      manager.on('data', data);

      await manager.connect({
        portName: 'COM3',
        manufacturer: TargetManufacturer.disag(),
        deviceId: 'DISAG_KT_RDT_ZIE_1_PISTOL',
      });
      mockPortInstance._events.data(validRedDotPistolFrame());
      await flushPromises();

      expect(mockPortInstance.write.mock.calls.map((call: unknown[]) => call[0])).toEqual([
        Buffer.from([0x05]),
        Buffer.from([0x06]),
      ]);
      expect(sound).toHaveBeenCalledTimes(1);
      expect(data).toHaveBeenCalledWith(expect.objectContaining({ x: 3, y: 4, score: 103, mode: 'MATCH' }));
    });

    it.each([
      [TargetManufacturer.disag(), undefined],
      [TargetManufacturer.disag(), 'DISAG_DEFAULT'],
      [TargetManufacturer.custom(), 'DISAG_KT_RDT_ZIE_1_RIFLE'],
      [TargetManufacturer.custom(), 'DISAG_KT_RDT_ZIE_1_PISTOL'],
    ])('should reject mismatched RedDot identity before opening a port', async (manufacturer, deviceId) => {
      await expect(
        manager.connect({
          portName: 'COM3',
          manufacturer,
          ...(deviceId === undefined ? {} : { deviceId }),
        }),
      ).rejects.toThrow();

      expect(SerialPort).not.toHaveBeenCalled();
    });

    it('should reject RedDot before opening when the active session uses another discipline', async () => {
      manager.setSessionContextProvider(() => ({
        discipline: Discipline.beamRifle10m(),
        mode: Mode.sighting(),
      }));

      await expect(
        manager.connect({
          portName: 'COM3',
          manufacturer: TargetManufacturer.disag(),
          deviceId: 'DISAG_KT_RDT_ZIE_1_RIFLE',
        }),
      ).rejects.toMatchObject({ code: 'INCOMPATIBLE_TARGET_DISCIPLINE' });

      expect(SerialPort).not.toHaveBeenCalled();
    });

    it('should reject the RedDot pistol profile outside AIR_PISTOL_10M', async () => {
      await expect(
        manager.connect({
          portName: 'COM3',
          manufacturer: TargetManufacturer.disag(),
          deviceId: 'DISAG_KT_RDT_ZIE_1_PISTOL',
        }),
      ).rejects.toMatchObject({
        code: 'INCOMPATIBLE_TARGET_DISCIPLINE',
        metadata: { requiredDiscipline: 'AIR_PISTOL_10M' },
      });

      expect(SerialPort).not.toHaveBeenCalled();
    });
  });

  describe('disconnect()', () => {
    it('should disconnect successfully', async () => {
      const config: USBConnectionConfig = {
        portName: 'COM3',
        manufacturer: TargetManufacturer.custom(),
      };

      await manager.connect(config);
      await manager.disconnect();

      expect(mockPortInstance.close).toHaveBeenCalled();
    });

    it('should remove port listeners on disconnect', async () => {
      const config: USBConnectionConfig = {
        portName: 'COM3',
        manufacturer: TargetManufacturer.custom(),
      };

      await manager.connect(config);
      await manager.disconnect();

      // Listeners are removed by both pipeline.detach() and lifecycle.disconnect()
      expect(mockPortInstance.removeAllListeners).toHaveBeenCalled();
    });

    it('should do nothing when not connected', async () => {
      await expect(manager.disconnect()).resolves.not.toThrow();
    });
  });

  describe('reconnect()', () => {
    it('should throw an error when there is no connection config', async () => {
      await expect(manager.reconnect()).rejects.toThrow();
    });

    it('should remove port listeners on reconnect', async () => {
      const config: USBConnectionConfig = {
        portName: 'COM3',
        manufacturer: TargetManufacturer.custom(),
      };

      await manager.connect(config);
      // reconnect() creates a new port, so keep a reference to the old one
      const firstPort = mockPortInstance;
      await manager.reconnect();

      // Listeners on the old port are removed by pipeline.detach()
      expect(firstPort.removeAllListeners).toHaveBeenCalled();
    });

    it('should stop the old RedDot session and start one poller on the new port', async () => {
      const config: USBConnectionConfig = {
        portName: 'COM3',
        manufacturer: TargetManufacturer.disag(),
        deviceId: 'DISAG_KT_RDT_ZIE_1_RIFLE',
      };
      await manager.connect(config);
      const firstPort = mockPortInstance;

      await manager.reconnect();
      const secondPort = mockPortInstance;

      expect(mockPortInstances).toHaveLength(2);
      expect(firstPort.removeListener).toHaveBeenCalledWith('data', expect.any(Function));
      expect(firstPort._events.data).toBeUndefined();
      expect(secondPort._events.data).toEqual(expect.any(Function));
      expect(firstPort.write).toHaveBeenCalledTimes(1);
      expect(secondPort.write).toHaveBeenCalledTimes(1);
      expect(secondPort.write.mock.calls[0]![0]).toEqual(Buffer.from([0x05]));
    });

    it('should stop RedDot protocol work and reconnect when error is not followed by close', async () => {
      const disconnected = vi.fn();
      manager.on('disconnected', disconnected);
      await manager.connect({
        portName: 'COM3',
        manufacturer: TargetManufacturer.disag(),
        deviceId: 'DISAG_KT_RDT_ZIE_1_RIFLE',
      });
      const firstPort = mockPortInstance;

      firstPort._events.error(new Error('serial failure'));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(disconnected).toHaveBeenCalledTimes(1);
      expect(firstPort.close).toHaveBeenCalledTimes(1);
      expect(mockPortInstances).toHaveLength(2);
      expect(mockPortInstance).not.toBe(firstPort);
      expect(mockPortInstance._events.data).toEqual(expect.any(Function));
      expect(mockPortInstance.write.mock.calls[0]![0]).toEqual(Buffer.from([0x05]));
    });

    it('should use the same disconnected recovery path after an ACK write failure', async () => {
      const registry = new AdapterRegistry();
      registry.registerAdapter('DISAG', new DisagAdapter());
      registry.assignDeviceAdapter('DISAG_KT_RDT_ZIE_1_RIFLE', 'DISAG');
      manager = new USBConnectionManager(registry);
      manager.setSessionContextProvider(() => ({
        discipline: Discipline.airRifle10m(),
        mode: Mode.sighting(),
      }));
      const disconnected = vi.fn();
      const data = vi.fn();
      manager.on('disconnected', disconnected);
      manager.on('data', data);

      await manager.connect({
        portName: 'COM3',
        manufacturer: TargetManufacturer.disag(),
        deviceId: 'DISAG_KT_RDT_ZIE_1_RIFLE',
      });
      const firstPort = mockPortInstance;
      firstPort.write.mockImplementationOnce((_chunk: Buffer, callback?: Function) =>
        callback?.(new Error('ACK failed')),
      );

      firstPort._events.data(validRedDotFrame());
      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(data).not.toHaveBeenCalled();
      expect(disconnected).toHaveBeenCalledTimes(1);
      expect(firstPort.close).toHaveBeenCalledTimes(1);
      expect(mockPortInstances).toHaveLength(2);
      expect(mockPortInstance).not.toBe(firstPort);
      expect(mockPortInstance.write.mock.calls[0]![0]).toEqual(Buffer.from([0x05]));
    });

    it('should surface a session discipline change instead of silently dropping later RedDot frames', async () => {
      const registry = new AdapterRegistry();
      registry.registerAdapter('DISAG', new DisagAdapter());
      registry.assignDeviceAdapter('DISAG_KT_RDT_ZIE_1_RIFLE', 'DISAG');
      manager = new USBConnectionManager(registry);
      let discipline = Discipline.airRifle10m();
      manager.setSessionContextProvider(() => ({ discipline, mode: Mode.sighting() }));
      const data = vi.fn();
      const disconnected = vi.fn();
      const reconnectFailed = vi.fn();
      manager.on('data', data);
      manager.on('disconnected', disconnected);
      manager.on('reconnectFailed', reconnectFailed);

      await manager.connect({
        portName: 'COM3',
        manufacturer: TargetManufacturer.disag(),
        deviceId: 'DISAG_KT_RDT_ZIE_1_RIFLE',
      });
      const firstPort = mockPortInstance;
      discipline = Discipline.beamRifle10m();

      firstPort._events.data(validRedDotFrame());
      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(data).not.toHaveBeenCalled();
      expect(disconnected).toHaveBeenCalledTimes(1);
      expect(firstPort.close).toHaveBeenCalledTimes(1);
      expect(reconnectFailed).toHaveBeenCalledWith(
        expect.objectContaining({
          lastError: expect.objectContaining({ code: 'INCOMPATIBLE_TARGET_DISCIPLINE' }),
        }),
      );
    });
  });

  describe('getStatus()', () => {
    it('should return DISCONNECTED status before connecting', () => {
      const status = manager.getStatus();

      expect(status.equals(ConnectionStatus.disconnected())).toBe(true);
    });

    it('should return CONNECTED status while connected', async () => {
      const config: USBConnectionConfig = {
        portName: 'COM3',
        manufacturer: TargetManufacturer.custom(),
      };

      await manager.connect(config);

      const status = manager.getStatus();

      expect(status.equals(ConnectionStatus.connected())).toBe(true);
    });
  });

  describe('setOnShotDetected()', () => {
    it('should delegate callback to the pipeline', () => {
      const callback = vi.fn();
      manager.setOnShotDetected(callback);

      // Verify no error is thrown — delegation is internal
      // The real verification is that USBDataPipeline receives the callback,
      // which is tested in USBDataPipeline.test.ts
      expect(() => manager.setOnShotDetected(callback)).not.toThrow();
    });
  });

  describe('listPorts()', () => {
    it('should retrieve a list of available ports', async () => {
      const ports = await manager.listPorts();

      expect(ports).toHaveLength(2);
      expect(ports[0]?.path).toBe('COM3');
      expect(ports[1]?.path).toBe('COM4');
    });
  });

  describe('Event listeners', () => {
    describe('on("connected")', () => {
      it('should invoke callback when connection is established', async () => {
        const config: USBConnectionConfig = {
          portName: 'COM3',
          manufacturer: TargetManufacturer.custom(),
        };

        const callback = vi.fn();
        manager.on('connected', callback);

        await manager.connect(config);

        expect(callback).toHaveBeenCalled();
        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({
            portPath: 'COM3',
            baudRate: 9600,
          }),
        );
      });
    });

    describe('on("disconnected")', () => {
      it('should not invoke callback for an explicit disconnect', async () => {
        const config: USBConnectionConfig = {
          portName: 'COM3',
          manufacturer: TargetManufacturer.custom(),
        };

        const callback = vi.fn();
        manager.on('disconnected', callback);

        await manager.connect(config);
        await manager.disconnect();

        expect(callback).not.toHaveBeenCalled();
      });
    });

    describe('unsubscribe', () => {
      it('should unsubscribe the listener using the unsubscribe function', async () => {
        const config: USBConnectionConfig = {
          portName: 'COM3',
          manufacturer: TargetManufacturer.custom(),
        };

        const callback = vi.fn();
        const unsubscribe = manager.on('connected', callback);

        unsubscribe();

        await manager.connect(config);

        expect(callback).not.toHaveBeenCalled();
      });
    });
  });

  async function flushPromises(): Promise<void> {
    for (let index = 0; index < 10; index += 1) {
      await Promise.resolve();
    }
  }
});
