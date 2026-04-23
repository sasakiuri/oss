// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { resolveSavedConnectionPort } from '@/shared/settings/resolveSavedConnectionPort';

describe('resolveSavedConnectionPort', () => {
  it('resolves a moved device by serial number', () => {
    const result = resolveSavedConnectionPort(
      {
        portName: '/dev/ttyUSB0',
        serialNumber: 'ABC123',
      },
      [
        { path: '/dev/ttyUSB1', serialNumber: 'ABC123', vendorId: '0403', productId: '6001' },
        { path: '/dev/ttyUSB0', serialNumber: 'DEF456', vendorId: '067b', productId: '2303' },
      ],
    );

    expect(result).toEqual({
      portName: '/dev/ttyUSB1',
      matchedBy: 'serialNumber',
    });
  });

  it('falls back to a unique vendor/product match when serial number is unavailable', () => {
    const result = resolveSavedConnectionPort(
      {
        portName: '/dev/ttyUSB0',
        vendorId: '0403',
        productId: '6001',
      },
      [
        { path: '/dev/ttyUSB2', vendorId: '0403', productId: '6001' },
        { path: '/dev/ttyUSB1', vendorId: '067b', productId: '2303' },
      ],
    );

    expect(result).toEqual({
      portName: '/dev/ttyUSB2',
      matchedBy: 'vendorProduct',
    });
  });

  it('keeps the saved path when multiple identical vendor/product devices exist but the original path is still present', () => {
    const result = resolveSavedConnectionPort(
      {
        portName: '/dev/ttyUSB0',
        vendorId: '0403',
        productId: '6001',
      },
      [
        { path: '/dev/ttyUSB0', vendorId: '0403', productId: '6001' },
        { path: '/dev/ttyUSB1', vendorId: '0403', productId: '6001' },
      ],
    );

    expect(result).toEqual({
      portName: '/dev/ttyUSB0',
      matchedBy: 'vendorProduct',
    });
  });

  it('returns null when the saved device cannot be resolved confidently', () => {
    const result = resolveSavedConnectionPort(
      {
        portName: '/dev/ttyUSB0',
        vendorId: '0403',
        productId: '6001',
      },
      [
        { path: '/dev/ttyUSB1', vendorId: '0403', productId: '6001' },
        { path: '/dev/ttyUSB2', vendorId: '0403', productId: '6001' },
      ],
    );

    expect(result).toBeNull();
  });

  it('falls back to the exact saved path when no stronger identifiers are available', () => {
    const result = resolveSavedConnectionPort(
      {
        portName: 'COM3',
      },
      [
        { path: 'COM3', vendorId: '0403', productId: '6001' },
        { path: 'COM4', vendorId: '067b', productId: '2303' },
      ],
    );

    expect(result).toEqual({
      portName: 'COM3',
      matchedBy: 'portName',
    });
  });

  it('does not fall back to the saved path when stronger identifiers contradict the current device', () => {
    const result = resolveSavedConnectionPort(
      {
        portName: '/dev/ttyUSB0',
        serialNumber: 'ABC123',
        vendorId: '0403',
        productId: '6001',
      },
      [
        { path: '/dev/ttyUSB0', serialNumber: 'DEF456', vendorId: '067b', productId: '2303' },
        { path: '/dev/ttyUSB1', serialNumber: 'GHI789', vendorId: '1234', productId: '5678' },
      ],
    );

    expect(result).toBeNull();
  });

  it('does not fall back to vendor/product when a saved serial number contradicts the only candidate device', () => {
    const result = resolveSavedConnectionPort(
      {
        portName: '/dev/ttyUSB0',
        serialNumber: 'ABC123',
        vendorId: '0403',
        productId: '6001',
      },
      [
        { path: '/dev/ttyUSB2', serialNumber: 'DEF456', vendorId: '0403', productId: '6001' },
        { path: '/dev/ttyUSB3', serialNumber: 'GHI789', vendorId: '067b', productId: '2303' },
      ],
    );

    expect(result).toBeNull();
  });

  it('does not fall back to vendor/product when the only candidate cannot confirm the saved serial number', () => {
    const result = resolveSavedConnectionPort(
      {
        portName: '/dev/ttyUSB0',
        serialNumber: 'ABC123',
        vendorId: '0403',
        productId: '6001',
      },
      [
        { path: '/dev/ttyUSB2', vendorId: '0403', productId: '6001' },
        { path: '/dev/ttyUSB3', serialNumber: 'GHI789', vendorId: '067b', productId: '2303' },
      ],
    );

    expect(result).toBeNull();
  });

  it('falls back to the saved path when vendor/product still confirm the same port but the serial number is missing', () => {
    const result = resolveSavedConnectionPort(
      {
        portName: '/dev/ttyUSB0',
        serialNumber: 'ABC123',
        vendorId: '0403',
        productId: '6001',
      },
      [
        { path: '/dev/ttyUSB0', vendorId: '0403', productId: '6001' },
        { path: '/dev/ttyUSB1', serialNumber: 'DEF456', vendorId: '067b', productId: '2303' },
      ],
    );

    expect(result).toEqual({
      portName: '/dev/ttyUSB0',
      matchedBy: 'portName',
    });
  });
});
