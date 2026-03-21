// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ServiceError } from '@/renderer/services/createServiceMethod';

const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockListPorts = vi.fn();
const mockGetDevicesByManufacturer = vi.fn();

vi.stubGlobal('window', {
  electronAPI: {
    usb: {
      connect: mockConnect,
      disconnect: mockDisconnect,
      listPorts: mockListPorts,
      getDevicesByManufacturer: mockGetDevicesByManufacturer,
    },
  },
});

const { connectionService } = await import('@/renderer/services/connectionService');

describe('connectionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('connect', () => {
    it('returns connectionId on success', async () => {
      mockConnect.mockResolvedValue({
        success: true,
        data: { connectionId: 'conn-123' },
      });

      const result = await connectionService.connect({
        portName: '/dev/ttyUSB0',
        manufacturer: 'KOHTO',
        deviceId: 'MT201',
        baudRate: 9600,
      });

      expect(result).toEqual({ connectionId: 'conn-123' });
      expect(mockConnect).toHaveBeenCalledWith({
        portName: '/dev/ttyUSB0',
        manufacturer: 'KOHTO',
        deviceId: 'MT201',
        baudRate: 9600,
      });
    });

    it('can be called without optional parameters', async () => {
      mockConnect.mockResolvedValue({
        success: true,
        data: { connectionId: 'conn-456' },
      });

      const result = await connectionService.connect({
        portName: 'COM3',
        manufacturer: 'SIUS',
      });

      expect(result).toEqual({ connectionId: 'conn-456' });
      expect(mockConnect).toHaveBeenCalledWith({
        portName: 'COM3',
        manufacturer: 'SIUS',
      });
    });

    it('throws ServiceError on failure', async () => {
      mockConnect.mockResolvedValue({
        success: false,
        error: { code: 'USB_ERROR', message: 'Port not found' },
      });

      await expect(connectionService.connect({ portName: 'COM99', manufacturer: 'SIUS' })).rejects.toThrow(
        ServiceError,
      );

      try {
        await connectionService.connect({ portName: 'COM99', manufacturer: 'SIUS' });
      } catch (err) {
        expect((err as ServiceError).code).toBe('USB_ERROR');
        expect((err as ServiceError).message).toBe('Port not found');
      }
    });

    it('wraps IPC errors with IPC_ERROR', async () => {
      mockConnect.mockRejectedValue(new Error('IPC timeout'));

      try {
        await connectionService.connect({ portName: 'COM1', manufacturer: 'DISAG' });
      } catch (err) {
        expect((err as ServiceError).code).toBe('IPC_ERROR');
      }
    });

    it('can call connect for all manufacturers', async () => {
      mockConnect.mockResolvedValue({
        success: true,
        data: { connectionId: 'id' },
      });

      for (const manufacturer of ['SIUS', 'MEYTON', 'DISAG', 'CUSTOM', 'KOHTO'] as const) {
        await connectionService.connect({ portName: 'COM1', manufacturer });
        expect(mockConnect).toHaveBeenCalledWith({ portName: 'COM1', manufacturer });
      }
    });
  });

  describe('disconnect', () => {
    it('returns void on success', async () => {
      mockDisconnect.mockResolvedValue({ success: true });

      await expect(connectionService.disconnect({ connectionId: 'conn-123' })).resolves.toBeUndefined();

      expect(mockDisconnect).toHaveBeenCalledWith({ connectionId: 'conn-123' });
    });

    it('throws ServiceError on failure', async () => {
      mockDisconnect.mockResolvedValue({
        success: false,
        error: { code: 'DISCONNECT_ERROR', message: 'Already disconnected' },
      });

      await expect(connectionService.disconnect({ connectionId: 'conn-123' })).rejects.toThrow(ServiceError);
    });
  });

  describe('listPorts', () => {
    const mockPorts = {
      ports: [{ path: '/dev/ttyUSB0', manufacturer: 'FTDI', vendorId: '0403' }, { path: '/dev/ttyUSB1' }],
    };

    it('returns ListPortsDto on success', async () => {
      mockListPorts.mockResolvedValue({
        success: true,
        data: mockPorts,
      });

      const result = await connectionService.listPorts();

      expect(result).toEqual(mockPorts);
      expect(mockListPorts).toHaveBeenCalled();
    });

    it('calls without arguments (createVoidServiceMethod)', async () => {
      mockListPorts.mockResolvedValue({ success: true, data: { ports: [] } });

      await connectionService.listPorts();

      expect(mockListPorts).toHaveBeenCalledWith();
    });

    it('throws ServiceError on failure', async () => {
      mockListPorts.mockResolvedValue({
        success: false,
        error: { code: 'LIST_ERROR', message: 'Cannot enumerate' },
      });

      await expect(connectionService.listPorts()).rejects.toThrow(ServiceError);
    });

    it('wraps IPC errors with IPC_ERROR', async () => {
      mockListPorts.mockRejectedValue(new Error('Bridge error'));

      try {
        await connectionService.listPorts();
      } catch (err) {
        expect((err as ServiceError).code).toBe('IPC_ERROR');
      }
    });
  });

  describe('getDevicesByManufacturer', () => {
    const mockDevices = {
      devices: [
        {
          id: 'MT201',
          manufacturer: 'KOHTO' as const,
          displayName: 'MT-201',
          baudRate: 9600,
          supportedDisciplines: ['AIR_RIFLE_10M' as const],
        },
      ],
    };

    it('returns GetDevicesByManufacturerDto on success', async () => {
      mockGetDevicesByManufacturer.mockResolvedValue({
        success: true,
        data: mockDevices,
      });

      const result = await connectionService.getDevicesByManufacturer({
        manufacturer: 'KOHTO',
      });

      expect(result).toEqual(mockDevices);
      expect(mockGetDevicesByManufacturer).toHaveBeenCalledWith({ manufacturer: 'KOHTO' });
    });

    it('throws ServiceError on failure', async () => {
      mockGetDevicesByManufacturer.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'No devices' },
      });

      await expect(connectionService.getDevicesByManufacturer({ manufacturer: 'MEYTON' })).rejects.toThrow(
        ServiceError,
      );
    });
  });
});
