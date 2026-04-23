// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { resolveAutoConnectSettings } from '@/main/resolveAutoConnectSettings';

describe('resolveAutoConnectSettings', () => {
  it('backfills USB identity fields from the matched port for migrated settings', () => {
    const result = resolveAutoConnectSettings(
      {
        portName: 'COM3',
        manufacturer: 'KOHTO',
        deviceId: 'MT201',
      },
      [
        {
          path: 'COM3',
          serialNumber: 'ABC123',
          vendorId: '0403',
          productId: '6001',
        },
      ],
    );

    expect(result).toEqual({
      settings: {
        portName: 'COM3',
        manufacturer: 'KOHTO',
        deviceId: 'MT201',
        serialNumber: 'ABC123',
        vendorId: '0403',
        productId: '6001',
      },
      resolvedPort: {
        portName: 'COM3',
        matchedBy: 'portName',
      },
      portNameChanged: false,
      identityUpdated: true,
      shouldPersist: true,
    });
  });

  it('does not request persistence when the resolved settings already match the saved identity', () => {
    const result = resolveAutoConnectSettings(
      {
        portName: '/dev/ttyUSB0',
        manufacturer: 'KOHTO',
        serialNumber: 'ABC123',
        vendorId: '0403',
        productId: '6001',
      },
      [
        {
          path: '/dev/ttyUSB0',
          serialNumber: 'ABC123',
          vendorId: '0403',
          productId: '6001',
        },
      ],
    );

    expect(result).toMatchObject({
      portNameChanged: false,
      identityUpdated: false,
      shouldPersist: false,
    });
  });

  it('keeps auto-connect enabled when the same port still matches vendor/product but no longer reports a serial number', () => {
    const result = resolveAutoConnectSettings(
      {
        portName: '/dev/ttyUSB0',
        manufacturer: 'KOHTO',
        deviceId: 'MT201',
        serialNumber: 'ABC123',
        vendorId: '0403',
        productId: '6001',
      },
      [
        {
          path: '/dev/ttyUSB0',
          vendorId: '0403',
          productId: '6001',
        },
      ],
    );

    expect(result).toEqual({
      settings: {
        portName: '/dev/ttyUSB0',
        manufacturer: 'KOHTO',
        deviceId: 'MT201',
        serialNumber: 'ABC123',
        vendorId: '0403',
        productId: '6001',
      },
      resolvedPort: {
        portName: '/dev/ttyUSB0',
        matchedBy: 'portName',
      },
      portNameChanged: false,
      identityUpdated: false,
      shouldPersist: false,
    });
  });

  it('keeps auto-connect enabled when the exact saved port is still present but no longer reports any USB identity metadata', () => {
    const result = resolveAutoConnectSettings(
      {
        portName: '/dev/ttyUSB0',
        manufacturer: 'KOHTO',
        deviceId: 'MT201',
        serialNumber: 'ABC123',
        vendorId: '0403',
        productId: '6001',
      },
      [
        {
          path: '/dev/ttyUSB0',
        },
      ],
    );

    expect(result).toEqual({
      settings: {
        portName: '/dev/ttyUSB0',
        manufacturer: 'KOHTO',
        deviceId: 'MT201',
        serialNumber: 'ABC123',
        vendorId: '0403',
        productId: '6001',
      },
      resolvedPort: {
        portName: '/dev/ttyUSB0',
        matchedBy: 'portName',
      },
      portNameChanged: false,
      identityUpdated: false,
      shouldPersist: false,
    });
  });
});
