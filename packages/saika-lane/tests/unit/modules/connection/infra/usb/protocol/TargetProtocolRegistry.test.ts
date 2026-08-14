// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import type { USBConnectionConfig } from '@/main/modules/connection/infra/usb/IUSBConnectionManager';
import type { TargetProtocol } from '@/main/modules/connection/infra/usb/protocol/TargetProtocol';
import { TargetProtocolRegistry } from '@/main/modules/connection/infra/usb/protocol/TargetProtocolRegistry';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { Mode } from '@/main/modules/session/domain/Mode';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';

const sessionContext = (discipline: Discipline) => () => ({ discipline, mode: Mode.sighting() });

function config(manufacturer: TargetManufacturer, deviceId: string | undefined): USBConnectionConfig {
  return {
    portName: 'COM3',
    manufacturer,
    ...(deviceId === undefined ? {} : { deviceId }),
  };
}

describe('TargetProtocolRegistry', () => {
  const registry = TargetProtocolRegistry.createDefault();

  it.each([
    [TargetManufacturer.kohto(), 'MT201', 'MT201'],
    [TargetManufacturer.kohto(), 'BPT216', 'BPT216'],
    [TargetManufacturer.kohto(), 'BP216', 'BPT216'],
    [TargetManufacturer.disag(), 'DISAG_KT_RDT_ZIE_1_RIFLE', 'DISAG_RED_DOT'],
    [TargetManufacturer.disag(), 'DISAG_KT_RDT_ZIE_1_PISTOL', 'DISAG_RED_DOT'],
    [TargetManufacturer.custom(), undefined, 'DIRECT_SERIAL'],
  ])('resolves %s / %s to %s', (manufacturer, deviceId, expectedProtocol) => {
    expect(registry.resolve(config(manufacturer, deviceId)).id).toBe(expectedProtocol);
  });

  it('keeps BPT-216 identity and discipline validation inside its protocol', () => {
    const protocolConfig = config(TargetManufacturer.kohto(), 'BPT216');
    const protocol = registry.resolve(protocolConfig);

    expect(() => protocol.validate(protocolConfig, sessionContext(Discipline.beamPistol10m()))).not.toThrow();
    expect(() => protocol.validate(protocolConfig, sessionContext(Discipline.beamRifle10m()))).toThrow();
    expect(() =>
      protocol.validate(config(TargetManufacturer.custom(), 'BPT216'), sessionContext(Discipline.beamPistol10m())),
    ).toThrow();
  });

  it('routes mismatched DISAG identities to RedDot validation instead of the direct fallback', () => {
    const protocolConfig = config(TargetManufacturer.disag(), 'DISAG_DEFAULT');
    const protocol = registry.resolve(protocolConfig);

    expect(protocol.id).toBe('DISAG_RED_DOT');
    expect(() => protocol.validate(protocolConfig, sessionContext(Discipline.airRifle10m()))).toThrow();
  });

  it('uses a catalog error when no protocols are registered', () => {
    expect(captureError(() => new TargetProtocolRegistry([]))).toMatchObject({
      code: 'INVALID_TARGET',
      metadata: { reason: 'At least one target protocol is required' },
    });
  });

  it('uses a catalog error when no protocol matches the configuration', () => {
    const neverMatchingProtocol: TargetProtocol = {
      id: 'NEVER',
      matches: () => false,
      validate: () => undefined,
      createSession: () => ({
        start: async () => undefined,
        stop: () => undefined,
        sendMode: async () => undefined,
      }),
    };
    const unmatchedConfig = config(TargetManufacturer.custom(), 'UNKNOWN');

    expect(
      captureError(() => new TargetProtocolRegistry([neverMatchingProtocol]).resolve(unmatchedConfig)),
    ).toMatchObject({
      code: 'INVALID_TARGET',
      metadata: {
        reason: 'No target protocol matches the connection configuration',
        manufacturer: 'CUSTOM',
        deviceId: 'UNKNOWN',
      },
    });
  });
});

function captureError(operation: () => unknown): unknown {
  try {
    operation();
    return null;
  } catch (error) {
    return error;
  }
}
