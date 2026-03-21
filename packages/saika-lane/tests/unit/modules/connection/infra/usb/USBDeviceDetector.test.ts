// SPDX-License-Identifier: MIT
import { SerialPort } from 'serialport';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { USBDeviceDetector } from '@/main/modules/connection/infra/usb/USBDeviceDetector';

// Mock electron
vi.mock('electron', () => ({
  app: { isPackaged: false },
}));

// Mock createLogger
vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  initializeLogger: vi.fn(),
}));

// Mock serialport
vi.mock('serialport', () => ({
  SerialPort: {
    list: vi.fn(),
  },
}));

describe('USBDeviceDetector', () => {
  let detector: USBDeviceDetector;

  beforeEach(() => {
    detector = new USBDeviceDetector();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listPorts()', () => {
    it('should retrieve a list of available ports', async () => {
      // Set up mock data
      const mockPorts = [
        {
          path: '/dev/ttyUSB0',
          manufacturer: 'FTDI',
          serialNumber: '12345678',
          vendorId: '0403',
          productId: '6001',
        },
        {
          path: '/dev/ttyUSB1',
          manufacturer: 'Prolific',
          serialNumber: '87654321',
          vendorId: '067b',
          productId: '2303',
        },
      ];

      vi.mocked(SerialPort.list).mockResolvedValue(mockPorts as any);

      // Execute test
      const ports = await detector.listPorts();

      // Verify
      expect(SerialPort.list).toHaveBeenCalledTimes(1);
      expect(ports).toHaveLength(2);
      expect(ports[0]).toEqual({
        path: '/dev/ttyUSB0',
        manufacturer: 'FTDI',
        serialNumber: '12345678',
        vendorId: '0403',
        productId: '6001',
      });
      expect(ports[1]).toEqual({
        path: '/dev/ttyUSB1',
        manufacturer: 'Prolific',
        serialNumber: '87654321',
        vendorId: '067b',
        productId: '2303',
      });
    });

    it('should return an empty array when no ports exist', async () => {
      vi.mocked(SerialPort.list).mockResolvedValue([]);

      const ports = await detector.listPorts();

      expect(ports).toEqual([]);
      expect(ports).toHaveLength(0);
    });

    it('should retrieve ports with missing optional fields', async () => {
      const mockPorts = [
        {
          path: '/dev/ttyUSB0',
          // manufacturer, serialNumber, vendorId, productId are undefined
        },
        {
          path: '/dev/ttyUSB1',
          manufacturer: 'FTDI',
          // serialNumber, vendorId, productId are undefined
        },
      ];

      vi.mocked(SerialPort.list).mockResolvedValue(mockPorts as any);

      const ports = await detector.listPorts();

      expect(ports).toHaveLength(2);
      expect(ports[0]).toEqual({
        path: '/dev/ttyUSB0',
        manufacturer: undefined,
        serialNumber: undefined,
        vendorId: undefined,
        productId: undefined,
      });
      expect(ports[1]).toEqual({
        path: '/dev/ttyUSB1',
        manufacturer: 'FTDI',
        serialNumber: undefined,
        vendorId: undefined,
        productId: undefined,
      });
    });

    it('should propagate the error when serialport.list() throws', async () => {
      const error = new Error('Failed to list ports');
      vi.mocked(SerialPort.list).mockRejectedValue(error);

      await expect(detector.listPorts()).rejects.toThrow('Failed to list ports');
    });
  });

  describe('findByVendorProduct()', () => {
    beforeEach(() => {
      const mockPorts = [
        {
          path: '/dev/ttyUSB0',
          manufacturer: 'FTDI',
          serialNumber: '12345678',
          vendorId: '0403',
          productId: '6001',
        },
        {
          path: '/dev/ttyUSB1',
          manufacturer: 'FTDI',
          serialNumber: '87654321',
          vendorId: '0403',
          productId: '6001',
        },
        {
          path: '/dev/ttyUSB2',
          manufacturer: 'Prolific',
          serialNumber: 'ABCD1234',
          vendorId: '067b',
          productId: '2303',
        },
      ];

      vi.mocked(SerialPort.list).mockResolvedValue(mockPorts as any);
    });

    it('should search ports by VendorID and ProductID', async () => {
      const ports = await detector.findByVendorProduct('0403', '6001');

      expect(ports).toHaveLength(2);
      expect(ports[0]!.path).toBe('/dev/ttyUSB0');
      expect(ports[1]!.path).toBe('/dev/ttyUSB1');
    });

    it('should return the port when only one matches', async () => {
      const ports = await detector.findByVendorProduct('067b', '2303');

      expect(ports).toHaveLength(1);
      expect(ports[0]!.path).toBe('/dev/ttyUSB2');
    });

    it('should return an empty array when no ports match', async () => {
      const ports = await detector.findByVendorProduct('FFFF', 'FFFF');

      expect(ports).toEqual([]);
      expect(ports).toHaveLength(0);
    });

    it('should return an empty array when VendorID matches but ProductID does not', async () => {
      const ports = await detector.findByVendorProduct('0403', 'FFFF');

      expect(ports).toEqual([]);
    });

    it('should return an empty array when ProductID matches but VendorID does not', async () => {
      const ports = await detector.findByVendorProduct('FFFF', '6001');

      expect(ports).toEqual([]);
    });

    it('should search case-insensitively', async () => {
      const ports = await detector.findByVendorProduct('0403', '6001');
      const portsUpperCase = await detector.findByVendorProduct('0403', '6001');
      const portsLowerCase = await detector.findByVendorProduct('0403', '6001');

      expect(ports).toEqual(portsUpperCase);
      expect(ports).toEqual(portsLowerCase);
    });

    it('should exclude ports with undefined VendorID or ProductID', async () => {
      const mockPortsWithUndefined = [
        {
          path: '/dev/ttyUSB0',
          manufacturer: 'FTDI',
          serialNumber: '12345678',
          // vendorId and productId are missing
        },
        {
          path: '/dev/ttyUSB1',
          manufacturer: 'FTDI',
          serialNumber: '87654321',
          vendorId: '0403',
          productId: '6001',
        },
      ];

      vi.mocked(SerialPort.list).mockResolvedValue(mockPortsWithUndefined as any);

      const ports = await detector.findByVendorProduct('0403', '6001');

      expect(ports).toHaveLength(1);
      expect(ports[0]!.path).toBe('/dev/ttyUSB1');
    });
  });

  describe('findBySerialNumber()', () => {
    beforeEach(() => {
      const mockPorts = [
        {
          path: '/dev/ttyUSB0',
          manufacturer: 'FTDI',
          serialNumber: 'ABC123',
          vendorId: '0403',
          productId: '6001',
        },
        {
          path: '/dev/ttyUSB1',
          manufacturer: 'FTDI',
          serialNumber: 'DEF456',
          vendorId: '0403',
          productId: '6001',
        },
        {
          path: '/dev/ttyUSB2',
          manufacturer: 'Prolific',
          serialNumber: 'GHI789',
          vendorId: '067b',
          productId: '2303',
        },
      ];

      vi.mocked(SerialPort.list).mockResolvedValue(mockPorts as any);
    });

    it('should search a port by serial number', async () => {
      const port = await detector.findBySerialNumber('ABC123');

      expect(port).not.toBeNull();
      expect(port?.path).toBe('/dev/ttyUSB0');
      expect(port?.serialNumber).toBe('ABC123');
    });

    it('should search a port by another serial number', async () => {
      const port = await detector.findBySerialNumber('DEF456');

      expect(port).not.toBeNull();
      expect(port?.path).toBe('/dev/ttyUSB1');
    });

    it('should return null when no port matches', async () => {
      const port = await detector.findBySerialNumber('XYZ999');

      expect(port).toBeNull();
    });

    it('should exclude ports with undefined serialNumber', async () => {
      const mockPortsWithUndefined = [
        {
          path: '/dev/ttyUSB0',
          manufacturer: 'FTDI',
          // serialNumber is missing
          vendorId: '0403',
          productId: '6001',
        },
        {
          path: '/dev/ttyUSB1',
          manufacturer: 'FTDI',
          serialNumber: 'ABC123',
          vendorId: '0403',
          productId: '6001',
        },
      ];

      vi.mocked(SerialPort.list).mockResolvedValue(mockPortsWithUndefined as any);

      const port = await detector.findBySerialNumber('ABC123');

      expect(port).not.toBeNull();
      expect(port?.path).toBe('/dev/ttyUSB1');
    });

    it('should return null when searching with an empty serial number', async () => {
      const port = await detector.findBySerialNumber('');

      expect(port).toBeNull();
    });

    it('should search case-insensitively', async () => {
      const port1 = await detector.findBySerialNumber('ABC123');
      const port2 = await detector.findBySerialNumber('abc123');

      expect(port1).not.toBeNull();
      expect(port2).not.toBeNull();
      expect(port1?.path).toBe(port2?.path);
    });
  });

  describe('Error handling', () => {
    it('should properly propagate errors when serialport.list() throws', async () => {
      const error = new Error('USB subsystem error');
      vi.mocked(SerialPort.list).mockRejectedValue(error);

      await expect(detector.listPorts()).rejects.toThrow('USB subsystem error');
      await expect(detector.findByVendorProduct('0403', '6001')).rejects.toThrow('USB subsystem error');
      await expect(detector.findBySerialNumber('ABC123')).rejects.toThrow('USB subsystem error');
    });
  });

  describe('Real serial port format (Windows)', () => {
    it('should handle Windows port format (COM ports)', async () => {
      const mockPorts = [
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
      ];

      vi.mocked(SerialPort.list).mockResolvedValue(mockPorts as any);

      const ports = await detector.listPorts();

      expect(ports).toHaveLength(2);
      expect(ports[0]!.path).toBe('COM3');
      expect(ports[1]!.path).toBe('COM4');
    });
  });

  describe('Real serial port format (Linux/macOS)', () => {
    it('should handle Linux/macOS port format', async () => {
      const mockPorts = [
        {
          path: '/dev/ttyUSB0',
          manufacturer: 'FTDI',
          serialNumber: 'ABC123',
          vendorId: '0403',
          productId: '6001',
        },
        {
          path: '/dev/cu.usbserial-ABC123',
          manufacturer: 'FTDI',
          serialNumber: 'ABC123',
          vendorId: '0403',
          productId: '6001',
        },
      ];

      vi.mocked(SerialPort.list).mockResolvedValue(mockPorts as any);

      const ports = await detector.listPorts();

      expect(ports).toHaveLength(2);
      expect(ports[0]!.path).toBe('/dev/ttyUSB0');
      expect(ports[1]!.path).toBe('/dev/cu.usbserial-ABC123');
    });
  });
});
