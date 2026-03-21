// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { windowContract } from '@/shared/ipc/contracts/window.contract';

describe('windowContract', () => {
  it('has 4 commands and 1 query', () => {
    const procs = windowContract.procedures;
    const commands = Object.values(procs).filter((p) => p.kind === 'command');
    const queries = Object.values(procs).filter((p) => p.kind === 'query');

    expect(commands).toHaveLength(4);
    expect(queries).toHaveLength(1);
  });

  it('has the expected channel names configured', () => {
    expect(windowContract.channels.toggleFullscreen).toBe('command:toggleFullscreen');
    expect(windowContract.channels.minimize).toBe('command:minimize');
    expect(windowContract.channels.maximize).toBe('command:maximize');
    expect(windowContract.channels.close).toBe('command:close');
    expect(windowContract.channels.getWindowState).toBe('query:getWindowState');
  });

  it('toggleFullscreen is a command with void input', () => {
    const proc = windowContract.procedures.toggleFullscreen;
    expect(proc.kind).toBe('command');
    expect(proc.input).toBeInstanceOf(z.ZodVoid);
  });

  it('minimize/close are commands with void input', () => {
    expect(windowContract.procedures.minimize.kind).toBe('command');
    expect(windowContract.procedures.minimize.input).toBeInstanceOf(z.ZodVoid);
    expect(windowContract.procedures.close.kind).toBe('command');
    expect(windowContract.procedures.close.input).toBeInstanceOf(z.ZodVoid);
  });

  it('getWindowState is a query with void input', () => {
    const proc = windowContract.procedures.getWindowState;
    expect(proc.kind).toBe('query');
    expect(proc.input).toBeInstanceOf(z.ZodVoid);
  });
});
