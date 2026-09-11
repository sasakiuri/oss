// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { reportContract } from '@/shared/ipc/contracts/report.contract';

describe('reportContract', () => {
  it('has 2 commands and 2 queries', () => {
    const procs = reportContract.procedures;
    const commands = Object.values(procs).filter((p) => p.kind === 'command');
    const queries = Object.values(procs).filter((p) => p.kind === 'query');

    expect(commands).toHaveLength(2);
    expect(queries).toHaveLength(2);
  });

  it('has the expected channel names configured', () => {
    expect(reportContract.channels.getScoreSheet).toBe('query:getScoreSheet');
    expect(reportContract.channels.openPrintWindow).toBe('command:openPrintWindow');
  });

  it('getScoreSheet input schema accepts valid data', () => {
    const schema = reportContract.procedures.getScoreSheet.input;
    const result = schema.safeParse({ sessionId: 'sess-1' });
    expect(result.success).toBe(true);
  });
});
