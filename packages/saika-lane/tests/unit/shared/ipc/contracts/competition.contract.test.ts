// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { competitionContract } from '@/shared/ipc/contracts/competition.contract';

describe('competitionContract', () => {
  it('has 6 commands and 2 queries', () => {
    const procs = competitionContract.procedures;
    const commands = Object.values(procs).filter((p) => p.kind === 'command');
    const queries = Object.values(procs).filter((p) => p.kind === 'query');

    expect(commands).toHaveLength(6);
    expect(queries).toHaveLength(2);
  });

  it('has the expected channel names configured', () => {
    expect(competitionContract.channels.startCompetition).toBe('command:startCompetition');
    expect(competitionContract.channels.startStage).toBe('command:startStage');
    expect(competitionContract.channels.startNextSeries).toBe('command:startNextSeries');
    expect(competitionContract.channels.endStage).toBe('command:endStage');
    expect(competitionContract.channels.advanceStage).toBe('command:advanceStage');
    expect(competitionContract.channels.finishCompetition).toBe('command:finishCompetition');
    expect(competitionContract.channels.getCompetitionState).toBe('query:getCompetitionState');
    expect(competitionContract.channels.getCompetitionTypes).toBe('query:getCompetitionTypes');
  });

  it('startCompetition input schema accepts valid data', () => {
    const schema = competitionContract.procedures.startCompetition.input;
    const result = schema.safeParse({ competitionTypeId: 'BR60S' });
    expect(result.success).toBe(true);
  });

  it('getCompetitionState input schema accepts valid data', () => {
    const schema = competitionContract.procedures.getCompetitionState.input;
    const result = schema.safeParse({ competitionId: 'comp-1' });
    expect(result.success).toBe(true);
  });
});
