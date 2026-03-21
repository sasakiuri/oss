// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { connectionContract } from '@/shared/ipc/contracts/connection.contract';

describe('connectionContract', () => {
  it('has 2 commands and 2 queries', () => {
    const procs = connectionContract.procedures;
    const commands = Object.values(procs).filter((p) => p.kind === 'command');
    const queries = Object.values(procs).filter((p) => p.kind === 'query');

    expect(commands).toHaveLength(2);
    expect(queries).toHaveLength(2);
  });

  it('has the expected channel names configured', () => {
    expect(connectionContract.channels.connect).toBe('usb:connect');
    expect(connectionContract.channels.disconnect).toBe('usb:disconnect');
    expect(connectionContract.channels.listPorts).toBe('usb:listPorts');
    expect(connectionContract.channels.getDevicesByManufacturer).toBe('usb:getDevicesByManufacturer');
  });

  it('connect input schema accepts valid data', () => {
    const schema = connectionContract.procedures.connect.input;
    const result = schema.safeParse({
      portName: '/dev/ttyUSB0',
      manufacturer: 'KOHTO',
    });
    expect(result.success).toBe(true);
  });

  it('connect input schema accepts optional fields', () => {
    const schema = connectionContract.procedures.connect.input;
    const result = schema.safeParse({
      portName: 'COM3',
      manufacturer: 'SIUS',
      deviceId: 'dev-1',
      baudRate: 9600,
    });
    expect(result.success).toBe(true);
  });

  it('listPorts is a query with void input', () => {
    const proc = connectionContract.procedures.listPorts;
    expect(proc.kind).toBe('query');
    expect(proc.input).toBeInstanceOf(Object);
  });
});
