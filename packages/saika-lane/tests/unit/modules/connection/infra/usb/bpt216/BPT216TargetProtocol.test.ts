// SPDX-License-Identifier: MIT
import type { SerialPort } from 'serialport';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BPT216TargetProtocol } from '@/main/modules/connection/infra/usb/bpt216/BPT216TargetProtocol';
import type { USBConnectionConfig } from '@/main/modules/connection/infra/usb/IUSBConnectionManager';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { Mode } from '@/main/modules/session/domain/Mode';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';

const logger = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => logger,
}));

describe('BPT216TargetProtocol', () => {
  beforeEach(() => {
    logger.warn.mockClear();
  });

  it('uses the canonical protocol ID when a legacy device alias sends a mode command', async () => {
    const config: USBConnectionConfig = {
      portName: 'COM3',
      manufacturer: TargetManufacturer.kohto(),
      deviceId: 'BP216',
    };
    const protocol = new BPT216TargetProtocol();
    const session = protocol.createSession(
      { isOpen: false } as SerialPort,
      config,
      () => () => ({ discipline: Discipline.beamPistol10m(), mode: Mode.sighting() }),
      {
        onStreamData: vi.fn(),
        onShotFrame: vi.fn(),
        onConnectionError: vi.fn(),
      },
    );

    await session.sendMode(Mode.sighting());

    expect(logger.warn).toHaveBeenCalledWith(
      '[USB] sendMode: port is not open, skipping',
      'usb',
      expect.objectContaining({ protocolId: 'BPT216', mode: 'SIGHTING', byte: 'S' }),
    );
  });
});
