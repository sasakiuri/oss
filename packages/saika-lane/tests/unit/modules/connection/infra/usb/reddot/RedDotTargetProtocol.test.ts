// SPDX-License-Identifier: MIT
import type { SerialPort } from 'serialport';
import { describe, expect, it, vi } from 'vitest';

import type { USBConnectionConfig } from '@/main/modules/connection/infra/usb/IUSBConnectionManager';
import {
  RED_DOT_ACK,
  RED_DOT_ENQ,
  RED_DOT_NAK,
  RED_DOT_RIFLE_TARGET_TYPE,
  RED_DOT_SET_TARGET_TYPE_COMMAND,
} from '@/main/modules/connection/infra/usb/reddot/RedDotProtocolSession';
import { RedDotTargetProtocol } from '@/main/modules/connection/infra/usb/reddot/RedDotTargetProtocol';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { Mode } from '@/main/modules/session/domain/Mode';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';

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
  manufacturer: TargetManufacturer.disag(),
  deviceId: 'DISAG_KT_RDT_ZIE_1_RIFLE',
};

describe('RedDotTargetProtocol', () => {
  it('does not start the inner protocol after port setup is cancelled', async () => {
    const { port, completeControlSignals } = createPendingControlPort();
    const protocol = new RedDotTargetProtocol();
    const session = protocol.createSession(
      port as unknown as SerialPort,
      config,
      () => () => ({ discipline: Discipline.airRifle10m(), mode: Mode.sighting() }),
      createHandlers(),
    );
    const outcome = session.start().catch((error: unknown) => error);

    session.stop();
    completeControlSignals();

    await expect(outcome).resolves.toMatchObject({ code: 'CONNECTION_FAILED' });
    expect(port.on).not.toHaveBeenCalled();
    expect(port.write).not.toHaveBeenCalled();
  });

  it('revalidates the active discipline after asynchronous port setup', async () => {
    const { port, completeControlSignals } = createPendingControlPort();
    const protocol = new RedDotTargetProtocol();
    let discipline = Discipline.airRifle10m();
    const session = protocol.createSession(
      port as unknown as SerialPort,
      config,
      () => () => ({ discipline, mode: Mode.sighting() }),
      createHandlers(),
    );
    const outcome = session.start().catch((error: unknown) => error);

    discipline = Discipline.beamRifle10m();
    completeControlSignals();

    await expect(outcome).resolves.toMatchObject({ code: 'INCOMPATIBLE_TARGET_DISCIPLINE' });
    expect(port.on).not.toHaveBeenCalled();
    expect(port.write).not.toHaveBeenCalled();
  });

  it('revalidates the active discipline after the target-type handshake', async () => {
    const { port, emitData } = createProtocolPort();
    const protocol = new RedDotTargetProtocol();
    let discipline = Discipline.airRifle10m();
    const session = protocol.createSession(
      port as unknown as SerialPort,
      config,
      () => () => ({ discipline, mode: Mode.sighting() }),
      createHandlers(),
    );
    const outcome = session.start().catch((error: unknown) => error);

    await flushPromises();
    expect(port.write.mock.calls.map((call) => call[0])).toEqual([Buffer.from([RED_DOT_ENQ])]);

    emitData(Buffer.from([RED_DOT_NAK]));
    await flushPromises();
    expect(port.write.mock.calls.map((call) => call[0])).toEqual([
      Buffer.from([RED_DOT_ENQ]),
      Buffer.from(RED_DOT_SET_TARGET_TYPE_COMMAND),
    ]);

    discipline = Discipline.beamRifle10m();
    emitData(Buffer.from([RED_DOT_ACK]));

    await expect(outcome).resolves.toMatchObject({ code: 'INCOMPATIBLE_TARGET_DISCIPLINE' });
    expect(port.write.mock.calls.map((call) => call[0])).toEqual([
      Buffer.from([RED_DOT_ENQ]),
      Buffer.from(RED_DOT_SET_TARGET_TYPE_COMMAND),
      Buffer.from([RED_DOT_RIFLE_TARGET_TYPE]),
    ]);
    expect(port.removeListener).toHaveBeenCalledWith('data', expect.any(Function));
  });
});

function createHandlers() {
  return {
    onStreamData: vi.fn(),
    onShotFrame: vi.fn(),
    onConnectionError: vi.fn(),
  };
}

function createPendingControlPort() {
  let controlCallback: ((error?: Error | null) => void) | null = null;
  const port = {
    set: vi.fn((_options: { dtr: boolean; rts: boolean }, callback: (error?: Error | null) => void) => {
      controlCallback = callback;
    }),
    on: vi.fn(),
    removeListener: vi.fn(),
    write: vi.fn(),
    drain: vi.fn(),
  };

  return {
    port,
    completeControlSignals: () => {
      if (controlCallback === null) {
        throw new Error('Control-signal callback was not registered');
      }
      controlCallback(null);
    },
  };
}

function createProtocolPort() {
  let dataListener: ((chunk: Buffer) => void) | null = null;
  const port = {
    set: vi.fn((_options: { dtr: boolean; rts: boolean }, callback: (error?: Error | null) => void) => callback(null)),
    on: vi.fn((_event: 'data', listener: (chunk: Buffer) => void) => {
      dataListener = listener;
    }),
    removeListener: vi.fn((_event: 'data', listener: (chunk: Buffer) => void) => {
      if (dataListener === listener) {
        dataListener = null;
      }
    }),
    write: vi.fn((_data: Buffer, callback: (error?: Error | null) => void) => callback(null)),
    drain: vi.fn((callback: (error?: Error | null) => void) => callback(null)),
  };

  return {
    port,
    emitData: (chunk: Buffer) => {
      if (dataListener === null) {
        throw new Error('RedDot data listener was not registered');
      }
      dataListener(chunk);
    },
  };
}

async function flushPromises(): Promise<void> {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
}
