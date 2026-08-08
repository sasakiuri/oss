// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  initializeLogger: vi.fn(),
  resetLogger: vi.fn(),
}));

import {
  createConnectionIpcHandlers,
  type ConnectionIpcHandlersDeps,
} from '@/main/modules/connection/infra/ConnectionIpcHandlers';

import { createMockCommandBus, createMockEventBus, createMockUSBManager } from '../../../../helpers/mockDependencies';

describe('ConnectionIpcHandlers', () => {
  let commandBus: ReturnType<typeof createMockCommandBus>;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let usbManager: ReturnType<typeof createMockUSBManager>;
  let deps: ConnectionIpcHandlersDeps;

  beforeEach(() => {
    vi.useFakeTimers();
    commandBus = createMockCommandBus();
    eventBus = createMockEventBus();
    usbManager = createMockUSBManager();
    deps = { commandBus, eventBus, usbManager };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createConnectionIpcHandlers', () => {
    it('should return an object with all 4 handlers', () => {
      const handlers = createConnectionIpcHandlers(deps);

      expect(handlers).toHaveProperty('connect');
      expect(handlers).toHaveProperty('disconnect');
      expect(handlers).toHaveProperty('listPorts');
      expect(handlers).toHaveProperty('getDevicesByManufacturer');
    });
  });

  describe('connect handler', () => {
    it('should execute ConnectToTarget command', async () => {
      (commandBus.execute as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        // Simulate ConnectionEstablished event
        (eventBus.emit as ReturnType<typeof vi.fn>)({
          type: 'ConnectionEstablished',
          aggregateId: 'conn-123',
          manufacturer: { value: 'KOHTO' },
          portPath: '/dev/ttyUSB0',
          timestamp: Date.now(),
        });
      });

      const handlers = createConnectionIpcHandlers(deps);
      const result = await handlers.connect({
        portName: '/dev/ttyUSB0',
        manufacturer: 'KOHTO',
      });

      expect(commandBus.execute).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ connectionId: 'conn-123' });
    });

    it('should pass baudRate and deviceId to command', async () => {
      (commandBus.execute as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        (eventBus.emit as ReturnType<typeof vi.fn>)({
          type: 'ConnectionEstablished',
          aggregateId: 'conn-456',
          manufacturer: { value: 'KOHTO' },
          portPath: 'COM3',
          deviceId: 'MT201',
          timestamp: Date.now(),
        });
      });

      const handlers = createConnectionIpcHandlers(deps);
      await handlers.connect({
        portName: 'COM3',
        manufacturer: 'KOHTO',
        baudRate: 19200,
        deviceId: 'MT201',
      });

      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'ConnectToTarget' }),
        expect.objectContaining({
          portName: 'COM3',
          baudRate: 19200,
          deviceId: 'MT201',
        }),
      );
    });

    it('should timeout after 10 seconds', async () => {
      (commandBus.execute as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const handlers = createConnectionIpcHandlers(deps);
      const promise = handlers.connect({
        portName: '/dev/ttyUSB0',
        manufacturer: 'KOHTO',
      });

      vi.advanceTimersByTime(10000);

      await expect(promise).rejects.toThrow();
    });

    it('should clean up event listener on success', async () => {
      const unsubscribe = vi.fn();
      const originalOn = eventBus.on as ReturnType<typeof vi.fn>;
      const originalImpl = originalOn.getMockImplementation();
      originalOn.mockImplementation((eventType: string, handler: Function) => {
        const unsub = originalImpl?.(eventType, handler) ?? vi.fn();
        if (eventType === 'ConnectionEstablished') {
          return () => {
            unsubscribe();
            unsub();
          };
        }
        return unsub;
      });

      (commandBus.execute as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        (eventBus.emit as ReturnType<typeof vi.fn>)({
          type: 'ConnectionEstablished',
          aggregateId: 'conn-789',
          manufacturer: { value: 'KOHTO' },
          portPath: '/dev/ttyUSB0',
          timestamp: Date.now(),
        });
      });

      const handlers = createConnectionIpcHandlers(deps);
      await handlers.connect({
        portName: '/dev/ttyUSB0',
        manufacturer: 'KOHTO',
      });

      expect(unsubscribe).toHaveBeenCalled();
    });

    it('should ignore unrelated ConnectionEstablished events while waiting for the requested connection', async () => {
      (commandBus.execute as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        (eventBus.emit as ReturnType<typeof vi.fn>)({
          type: 'ConnectionEstablished',
          aggregateId: 'auto-reconnect-conn',
          manufacturer: { value: 'KOHTO' },
          portPath: '/dev/ttyUSB9',
          timestamp: Date.now(),
        });
        (eventBus.emit as ReturnType<typeof vi.fn>)({
          type: 'ConnectionEstablished',
          aggregateId: 'manual-connect-conn',
          manufacturer: { value: 'KOHTO' },
          portPath: '/dev/ttyUSB0',
          timestamp: Date.now(),
        });
      });

      const handlers = createConnectionIpcHandlers(deps);
      const result = await handlers.connect({
        portName: '/dev/ttyUSB0',
        manufacturer: 'KOHTO',
      });

      expect(result).toEqual({ connectionId: 'manual-connect-conn' });
    });
  });

  describe('disconnect handler', () => {
    it('should execute DisconnectFromTarget command', async () => {
      (commandBus.execute as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const handlers = createConnectionIpcHandlers(deps);
      await handlers.disconnect({ connectionId: 'conn-123' });

      expect(commandBus.execute).toHaveBeenCalledWith(expect.objectContaining({ name: 'DisconnectFromTarget' }), {
        connectionId: 'conn-123',
      });
    });
  });

  describe('listPorts handler', () => {
    it('should return port list from usbManager', async () => {
      (usbManager.listPorts as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          path: '/dev/ttyUSB0',
          manufacturer: 'FTDI',
          serialNumber: 'SN001',
          vendorId: '0403',
          productId: '6001',
        },
      ]);

      const handlers = createConnectionIpcHandlers(deps);
      const result = await handlers.listPorts();

      expect(result).toEqual({
        ports: [
          {
            path: '/dev/ttyUSB0',
            manufacturer: 'FTDI',
            serialNumber: 'SN001',
            vendorId: '0403',
            productId: '6001',
          },
        ],
      });
    });

    it('should return empty array when no ports available', async () => {
      (usbManager.listPorts as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const handlers = createConnectionIpcHandlers(deps);
      const result = await handlers.listPorts();

      expect(result).toEqual({ ports: [] });
    });

    it('should map only relevant port fields', async () => {
      (usbManager.listPorts as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          path: 'COM3',
          manufacturer: undefined,
          serialNumber: undefined,
          vendorId: undefined,
          productId: undefined,
        },
      ]);

      const handlers = createConnectionIpcHandlers(deps);
      const result = await handlers.listPorts();

      expect(result).toEqual({
        ports: [
          {
            path: 'COM3',
            manufacturer: undefined,
            serialNumber: undefined,
            vendorId: undefined,
            productId: undefined,
          },
        ],
      });
    });
  });

  describe('getDevicesByManufacturer handler', () => {
    it('should return devices for KOHTO manufacturer', async () => {
      const handlers = createConnectionIpcHandlers(deps);
      const result = (await handlers.getDevicesByManufacturer({ manufacturer: 'KOHTO' })) as {
        devices: Array<{ id: string; manufacturer: string; displayName: string; baudRate: number }>;
      };

      expect(result.devices).toBeInstanceOf(Array);
      expect(result.devices.length).toBeGreaterThan(0);
      expect(result.devices[0]).toHaveProperty('id');
      expect(result.devices[0]).toHaveProperty('manufacturer');
      expect(result.devices[0]).toHaveProperty('displayName');
      expect(result.devices[0]).toHaveProperty('baudRate');
      expect(result.devices[0]).toHaveProperty('supportedDisciplines');
    });

    it('should return devices with correct manufacturer field', async () => {
      const handlers = createConnectionIpcHandlers(deps);
      const result = (await handlers.getDevicesByManufacturer({ manufacturer: 'KOHTO' })) as {
        devices: Array<{ manufacturer: string }>;
      };

      for (const device of result.devices) {
        expect(device.manufacturer).toBe('KOHTO');
      }
    });

    it('should expose the RedDot rifle for DISAG', async () => {
      const handlers = createConnectionIpcHandlers(deps);
      const result = (await handlers.getDevicesByManufacturer({ manufacturer: 'DISAG' })) as {
        devices: Array<{
          id: string;
          manufacturer: string;
          displayName: string;
          baudRate: number;
          supportedDisciplines: string[];
        }>;
      };

      expect(result.devices).toContainEqual({
        id: 'DISAG_KT_RDT_ZIE_1_RIFLE',
        manufacturer: 'DISAG',
        displayName: 'DISAG RedDot Rifle',
        baudRate: 9600,
        supportedDisciplines: ['AIR_RIFLE_10M'],
      });
    });

    it('should throw on invalid manufacturer', async () => {
      const handlers = createConnectionIpcHandlers(deps);

      await expect(handlers.getDevicesByManufacturer({ manufacturer: 'INVALID' as 'KOHTO' })).rejects.toThrow();
    });

    it('should return supportedDisciplines as string arrays', async () => {
      const handlers = createConnectionIpcHandlers(deps);
      const result = (await handlers.getDevicesByManufacturer({ manufacturer: 'KOHTO' })) as {
        devices: Array<{ supportedDisciplines: string[] }>;
      };

      for (const device of result.devices) {
        expect(device.supportedDisciplines).toBeInstanceOf(Array);
        for (const discipline of device.supportedDisciplines) {
          expect(typeof discipline).toBe('string');
        }
      }
    });
  });
});
