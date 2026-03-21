// SPDX-License-Identifier: MIT
import { app } from 'electron';
import { SerialPort } from 'serialport';

import { getLogger } from '@/main/shared-infra/logging/createLogger';
import type { IpcLogger } from '@/main/shared-infra/logging/IpcLogger';

import type { USBPortInfo } from './IUSBConnectionManager';

/**
 * USBDeviceDetector class
 *
 * Provides detection and search functionality for USB-connected serial devices.
 *
 * Key features:
 * - Retrieve a list of available USB ports
 * - Search ports by VendorID/ProductID
 * - Search ports by serial number
 *
 * Design principles:
 * - Hides dependency on the serialport library
 * - Designed with testability in mind
 * - Ensures type safety
 *
 * @example
 * ```typescript
 * const detector = new USBDeviceDetector();
 *
 * // Get all ports
 * const ports = await detector.listPorts();
 *
 * // Search by VendorID/ProductID
 * const ftdiPorts = await detector.findByVendorProduct('0403', '6001');
 *
 * // Search by serial number
 * const port = await detector.findBySerialNumber('ABC123');
 * ```
 */
export class USBDeviceDetector {
  /**
   * Get a list of available USB ports
   *
   * Scans and returns all serial ports recognized by the system.
   * Each port includes path, manufacturer name, serial number, VendorID, and ProductID.
   *
   * @returns Array of available port information
   * @throws Propagates errors thrown by the serialport library as-is
   *
   * @example
   * ```typescript
   * const detector = new USBDeviceDetector();
   * const ports = await detector.listPorts();
   *
   * ports.forEach(port => {
   *   console.log(`Port: ${port.path}`);
   *   console.log(`Manufacturer: ${port.manufacturer}`);
   *   console.log(`Serial number: ${port.serialNumber}`);
   *   console.log(`VendorID: ${port.vendorId}`);
   *   console.log(`ProductID: ${port.productId}`);
   * });
   * ```
   */
  async listPorts(): Promise<USBPortInfo[]> {
    const logger = getLogger();

    if (!app.isPackaged) {
      await this.logPortDiagnostics(logger);
    }

    let ports: Awaited<ReturnType<typeof SerialPort.list>>;
    try {
      ports = await SerialPort.list();
    } catch (error) {
      logger.error('[USBDeviceDetector] SerialPort.list() threw an error', 'usb', {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }

    logger.debug('[USBDeviceDetector] SerialPort.list() raw result', 'usb', {
      count: ports.length,
      ports: ports.map((p) => ({
        path: p.path,
        manufacturer: p.manufacturer,
        serialNumber: p.serialNumber,
        vendorId: p.vendorId,
        productId: p.productId,
        pnpId: p.pnpId,
        locationId: p.locationId,
      })),
    });

    return ports.map((port) => ({
      path: port.path,
      manufacturer: port.manufacturer,
      serialNumber: port.serialNumber,
      vendorId: port.vendorId,
      productId: port.productId,
    }));
  }

  private async logPortDiagnostics(logger: IpcLogger): Promise<void> {
    try {
      const resolvedPath = require.resolve('serialport');
      logger.debug('[USBDeviceDetector] SerialPort module resolved', 'usb', {
        resolvedPath,
      });

      const bindingsCppPath = require.resolve('@serialport/bindings-cpp');
      logger.debug('[USBDeviceDetector] bindings-cpp resolved', 'usb', {
        bindingsCppPath,
      });

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const bindingsCpp = require('@serialport/bindings-cpp');
      const autoDetected = bindingsCpp.autoDetect();
      logger.debug('[USBDeviceDetector] Native binding check', 'usb', {
        bindingKeys: Object.keys(bindingsCpp),
        autoDetectedName: autoDetected?.name ?? 'unknown',
        hasListMethod: typeof autoDetected?.list === 'function',
      });

      const nativePorts = await autoDetected.list();
      logger.debug('[USBDeviceDetector] Native binding list() result', 'usb', {
        count: nativePorts.length,
        ports: nativePorts,
      });
    } catch (diagError) {
      logger.warn('[USBDeviceDetector] Binding diagnostic failed', 'usb', {
        error: String(diagError),
        stack: diagError instanceof Error ? diagError.stack : undefined,
      });
    }
  }

  /**
   * Search ports by VendorID and ProductID
   *
   * Returns all ports matching the specified VendorID and ProductID.
   * The search is case-insensitive.
   * Ports where VendorID or ProductID is undefined are excluded from the search.
   *
   * @param vendorId - Vendor ID (e.g. "0403" for FTDI)
   * @param productId - Product ID (e.g. "6001")
   * @returns Array of matching port information (empty array if no matches)
   * @throws Propagates errors thrown by the serialport library as-is
   *
   * @example
   * ```typescript
   * const detector = new USBDeviceDetector();
   *
   * // Search for FTDI devices (VendorID: 0403, ProductID: 6001)
   * const ftdiPorts = await detector.findByVendorProduct('0403', '6001');
   *
   * if (ftdiPorts.length > 0) {
   *   console.log(`${ftdiPorts.length} FTDI device(s) found`);
   *   ftdiPorts.forEach(port => {
   *     console.log(`Port: ${port.path}`);
   *   });
   * } else {
   *   console.log('No FTDI devices found');
   * }
   * ```
   */
  async findByVendorProduct(vendorId: string, productId: string): Promise<USBPortInfo[]> {
    const ports = await this.listPorts();

    // Normalize VendorID and ProductID (convert to lowercase)
    const normalizedVendorId = vendorId.toLowerCase();
    const normalizedProductId = productId.toLowerCase();

    // Filter ports matching VendorID and ProductID
    return ports.filter((port) => {
      // Exclude ports where vendorId or productId is undefined
      if (!port.vendorId || !port.productId) {
        return false;
      }

      return port.vendorId.toLowerCase() === normalizedVendorId && port.productId.toLowerCase() === normalizedProductId;
    });
  }

  /**
   * Search for a port by serial number
   *
   * Returns the port matching the specified serial number.
   * The search is case-insensitive.
   * Ports where the serial number is undefined are excluded from the search.
   *
   * @param serialNumber - Serial number
   * @returns Matching port information (null if no match)
   * @throws Propagates errors thrown by the serialport library as-is
   *
   * @example
   * ```typescript
   * const detector = new USBDeviceDetector();
   *
   * // Search for a device by serial number
   * const port = await detector.findBySerialNumber('ABC12345');
   *
   * if (port) {
   *   console.log(`Device found: ${port.path}`);
   *   console.log(`Manufacturer: ${port.manufacturer}`);
   * } else {
   *   console.log('Device not found');
   * }
   * ```
   */
  async findBySerialNumber(serialNumber: string): Promise<USBPortInfo | null> {
    // Early return for empty string
    if (!serialNumber || serialNumber.length === 0) {
      return null;
    }

    const ports = await this.listPorts();

    // Normalize serial number (convert to lowercase)
    const normalizedSerialNumber = serialNumber.toLowerCase();

    // Search for a port matching the serial number
    const matchedPort = ports.find((port) => {
      // Exclude ports where serialNumber is undefined
      if (!port.serialNumber) {
        return false;
      }

      return port.serialNumber.toLowerCase() === normalizedSerialNumber;
    });

    return matchedPort || null;
  }
}
