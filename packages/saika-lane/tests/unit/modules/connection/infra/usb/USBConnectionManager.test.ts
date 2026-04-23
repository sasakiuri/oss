// SPDX-License-Identifier: MIT
import { SerialPort } from 'serialport';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectionStatus } from '@/main/modules/connection/domain/ConnectionStatus';
import type { USBConnectionConfig } from '@/main/modules/connection/infra/usb/IUSBConnectionManager';
import { USBConnectionManager } from '@/main/modules/connection/infra/usb/USBConnectionManager';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import { AdapterRegistry } from '@/main/modules/target/infra/AdapterRegistry';

// Mock Electron
vi.mock('electron', () => ({
  app: { isPackaged: false },
}));

// Mock SerialPort instance
let mockPortInstance: any;

// Mock serialport
vi.mock('serialport', () => {
  const mockSerialPort = vi.fn().mockImplementation((options: any) => {
    mockPortInstance = {
      _events: {},
      _isOpen: false,
      path: options.path,
      baudRate: options.baudRate,
      on: vi.fn(function (this: any, event: string, callback: Function) {
        this._events[event] = callback;
        return this;
      }),
      open: vi.fn(function (this: any, callback?: Function) {
        setTimeout(() => {
          this._isOpen = true;
          if (this._events.open) {
            this._events.open();
          }
          if (callback) callback(null);
        }, 10);
      }),
      close: vi.fn(function (this: any, callback?: Function) {
        setTimeout(() => {
          this._isOpen = false;
          if (callback) callback(null);
        }, 10);
      }),
      write: vi.fn(),
      removeAllListeners: vi.fn(),
      get isOpen() {
        return this._isOpen;
      },
      set isOpen(value: boolean) {
        this._isOpen = value;
      },
    };
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
    manager = new USBConnectionManager(new AdapterRegistry());
  });

  afterEach(() => {
    // Don't restore mocks as it breaks subsequent tests
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
});
