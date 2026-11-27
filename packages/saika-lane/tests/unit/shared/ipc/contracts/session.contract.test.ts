// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { sessionContract } from '@/shared/ipc/contracts/session.contract';

describe('sessionContract', () => {
  it('has 2 commands and 2 queries', () => {
    const procs = sessionContract.procedures;
    const commands = Object.values(procs).filter((p) => p.kind === 'command');
    const queries = Object.values(procs).filter((p) => p.kind === 'query');

    expect(commands).toHaveLength(2);
    expect(queries).toHaveLength(2);
  });

  it('has the expected channel names configured', () => {
    expect(sessionContract.channels.recordShot).toBe('command:recordShot');
    expect(sessionContract.channels.switchMode).toBe('command:switchMode');
    expect(sessionContract.channels.getSessionScore).toBe('query:getSessionScore');
    expect(sessionContract.channels.getShotHistory).toBe('query:getShotHistory');
  });

  it('recordShot input schema accepts valid data', () => {
    const schema = sessionContract.procedures.recordShot.input;
    const result = schema.safeParse({
      sessionId: 'sess-1',
      impactPoint: { x: 1.5, y: -2.3 },
      timestamp: '2026-01-01T00:00:00Z',
    });
    expect(result.success).toBe(true);
  });
});
