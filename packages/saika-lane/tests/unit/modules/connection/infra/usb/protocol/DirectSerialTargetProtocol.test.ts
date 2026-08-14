// SPDX-License-Identifier: MIT
import type { SerialPort } from 'serialport';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { USBConnectionConfig } from '@/main/modules/connection/infra/usb/IUSBConnectionManager';
import { DirectSerialTargetProtocolSession } from '@/main/modules/connection/infra/usb/protocol/DirectSerialTargetProtocol';
import { Mode } from '@/main/modules/session/domain/Mode';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';

vi.mock('electron', () => ({ app: { isPackaged: false } }));

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    isLevelEnabled: vi.fn().mockReturnValue(true),
  }),
}));

const config: USBConnectionConfig = {
  portName: 'COM3',
  manufacturer: TargetManufacturer.kohto(),
  deviceId: 'MT201',
};

describe('DirectSerialTargetProtocolSession', () => {
  const originalReadableMode = process.env.USE_READABLE_MODE;

  beforeEach(() => {
    delete process.env.USE_READABLE_MODE;
  });

  afterEach(() => {
    if (originalReadableMode === undefined) {
      delete process.env.USE_READABLE_MODE;
    } else {
      process.env.USE_READABLE_MODE = originalReadableMode;
    }
  });

  it('owns the MT-201 data listener and removes only its listeners on stop', async () => {
    const port = createPort();
    const onStreamData = vi.fn();
    const session = createSession(port, onStreamData);

    await session.start();
    port.listeners.data?.(Buffer.from('R 9.7 0250 FF5F 70\n'));
    session.stop();

    expect(onStreamData).toHaveBeenCalledWith(Buffer.from('R 9.7 0250 FF5F 70\n'));
    expect(port.removeListener).toHaveBeenCalledWith('data', expect.any(Function));
    expect(port.removeListener).toHaveBeenCalledWith('readable', expect.any(Function));
  });

  it('preserves the unterminated S/R commands used by the established path', async () => {
    const port = createPort();
    const session = createSession(port, vi.fn());

    await session.start();
    await session.sendMode(Mode.sighting());
    await session.sendMode(Mode.match());

    expect(port.write.mock.calls.map((call) => call[0])).toEqual([Buffer.from('S'), Buffer.from('R')]);
  });

  it('keeps the diagnostic readable mode behind the protocol boundary', async () => {
    process.env.USE_READABLE_MODE = 'true';
    const port = createPort();
    const chunk = Buffer.from('S10.5 00D0 FFC8 71\n');
    port.read.mockReturnValueOnce(chunk).mockReturnValueOnce(null);
    const onStreamData = vi.fn();
    const session = createSession(port, onStreamData);

    await session.start();
    port.listeners.readable?.();

    expect(onStreamData).toHaveBeenCalledWith(chunk);
    expect(port.listeners.data).toBeUndefined();
  });
});

function createSession(port: ReturnType<typeof createPort>, onStreamData: ReturnType<typeof vi.fn>) {
  return new DirectSerialTargetProtocolSession('MT201', port as unknown as SerialPort, config, {
    onStreamData,
    onShotFrame: vi.fn(),
    onConnectionError: vi.fn(),
  });
}

function createPort() {
  const listeners: { data?: (chunk: Buffer) => void; readable?: () => void } = {};
  return {
    listeners,
    isOpen: true,
    on: vi.fn((event: 'data' | 'readable', listener: ((chunk: Buffer) => void) | (() => void)) => {
      if (event === 'data') {
        listeners.data = listener as (chunk: Buffer) => void;
      } else {
        listeners.readable = listener as () => void;
      }
    }),
    removeListener: vi.fn(),
    read: vi.fn(),
    write: vi.fn((_data: Buffer, callback: (error?: Error | null) => void) => callback(null)),
  };
}
