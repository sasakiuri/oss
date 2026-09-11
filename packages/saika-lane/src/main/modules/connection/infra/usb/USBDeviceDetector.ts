// SPDX-License-Identifier: MIT
import { app } from 'electron';
import { SerialPort } from 'serialport';

import { getLogger } from '@/main/shared-infra/logging/createLogger';
import type { IpcLogger } from '@/main/shared-infra/logging/IpcLogger';

import type { USBPortInfo } from './IUSBConnectionManager';

/** Lists serial ports and finds devices by USB IDs or serial number. */
export class USBDeviceDetector {
  /** Lists OS serial ports. Errors from serialport propagate to the caller. */
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

  /** Matches both IDs case-insensitively, excluding ports with missing IDs. */
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

  /** Matches serial numbers case-insensitively. Returns null for empty input or no match. */
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
