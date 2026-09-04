// SPDX-License-Identifier: MIT
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createQualificationRecoveryRunStart,
  SqliteQualificationRecoveryRepository,
} from '@/main/modules/qualification-recovery';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';

describe('SqliteQualificationRecoveryRepository', () => {
  let db: Database.Database;
  let repository: SqliteQualificationRecoveryRepository;

  beforeEach(() => {
    db = createSqliteDb(':memory:');
    repository = new SqliteQualificationRecoveryRepository(db);
  });

  afterEach(() => db.close());

  function appendStart() {
    repository.appendStarted(
      createQualificationRecoveryRunStart({
        runId: 'run-1',
        sequenceId: 'sequence-1',
        decisionId: 'decision-1',
        interruptionId: 'interruption-1',
        competitionId: 'competition-1',
        stageIndex: 1,
        seriesIndex: 2,
        expectedMatchProgramId: 'P25_MATCH_PRECISION_240',
        executionProgramId: 'P25_MATCH_PRECISION_240',
        expectedSeriesShotLimit: 5,
        expectedRecordedShots: 3,
        authorization: {
          phase: 'SERIES_RECOVERY',
          seriesRecovery: {
            treatment: 'COMPLETE_REMAINING_SHOTS',
            shotsToFire: 2,
            execution: { mode: 'SECONDS_PER_SHOT', secondsPerShot: 48, totalSeconds: 96 },
          },
        },
        targetProfileId: 'ISSF_PISTOL_25M_PRECISION_2026',
        loadAt: new Date('2026-09-03T01:00:00.000Z'),
        officialName: 'Jury Member',
        decisionRuleReference: '8.8.1(c-d)',
        decidedAt: new Date('2026-09-03T00:58:00.000Z'),
        startedAt: new Date('2026-09-03T00:59:00.000Z'),
      }),
    );
  }

  it('projects start, shots and terminal state from an append-only event stream', () => {
    appendStart();
    repository.appendShot('run-1', {
      shotId: 'shot-1',
      observationId: 'observation-1',
      firedAt: new Date('2026-09-03T01:01:10.000Z'),
      recordedAt: new Date('2026-09-03T01:01:10.010Z'),
    });
    repository.appendTerminal({
      runId: 'run-1',
      status: 'COMPLETED',
      reason: 'All recovery recording windows elapsed',
      occurredAt: new Date('2026-09-03T01:02:43.000Z'),
      recordedAt: new Date('2026-09-03T01:02:43.010Z'),
    });

    expect(repository.findByRunId('run-1')).toMatchObject({
      decisionId: 'decision-1',
      status: 'COMPLETED',
      terminalReason: 'All recovery recording windows elapsed',
      shots: [{ shotId: 'shot-1', observationId: 'observation-1' }],
    });
  });

  it('deduplicates a replayed shot and terminal event without rewriting history', () => {
    appendStart();
    const shot = {
      shotId: 'shot-1',
      observationId: null,
      firedAt: new Date('2026-09-03T01:01:10.000Z'),
      recordedAt: new Date('2026-09-03T01:01:10.010Z'),
    };
    repository.appendShot('run-1', shot);
    repository.appendShot('run-1', shot);
    const terminal = {
      runId: 'run-1',
      status: 'CANCELLED' as const,
      reason: 'Official cancellation',
      occurredAt: new Date('2026-09-03T01:02:00.000Z'),
      recordedAt: new Date('2026-09-03T01:02:00.010Z'),
    };
    repository.appendTerminal(terminal);
    repository.appendTerminal(terminal);

    expect(repository.findByRunId('run-1')).toMatchObject({ status: 'CANCELLED', shots: [{ shotId: 'shot-1' }] });
    expect(
      (db.prepare('SELECT COUNT(*) AS count FROM qualification_recovery_run_events').get() as { count: number }).count,
    ).toBe(3);
  });

  it('prevents updates and deletes at the database boundary', () => {
    appendStart();
    expect(() => db.prepare("UPDATE qualification_recovery_run_events SET competition_id = 'changed'").run()).toThrow(
      'append-only',
    );
    expect(() => db.prepare('DELETE FROM qualification_recovery_run_events').run()).toThrow('append-only');
  });

  it('upgrades the Lane database to schema version 14', () => {
    expect(db.pragma('user_version', { simple: true })).toBe(16);
  });
});
