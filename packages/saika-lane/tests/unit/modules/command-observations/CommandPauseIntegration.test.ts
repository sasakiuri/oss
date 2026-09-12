// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ISSF_2026_P25, ISSF_2026_RFPM, ISSF_2026_STDP, ISSF_2026_P25_FINAL } from '@sasakiuri/saika-rules';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TimedTargetCommandPause } from '@/main/modules/command-observations/application/TimedTargetCommandPause';
import { SqliteCommandObservationRepository } from '@/main/modules/command-observations/infra/SqliteCommandObservationRepository';
import { TimedTargetSequenceService } from '@/main/modules/timed-target/application/TimedTargetSequenceService';
import { SqliteTimedTargetSequenceRepository } from '@/main/modules/timed-target/infra/SqliteTimedTargetSequenceRepository';
import { allMigrations } from '@/main/shared-infra/sqlite/migrations';
import { MigrationRunner } from '@/main/shared-infra/sqlite/migrations/MigrationRunner';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';

const program = ISSF_2026_P25.capabilities.timedTarget!.programs[0]!;
const input = {
  sequenceId: 'first',
  competitionId: 'competition',
  program,
  stageIndex: 1,
  seriesIndex: 0,
  targetProfileId: 'precision',
  loadAt: new Date('2026-09-07T12:00:00Z'),
};

describe('UNLOAD command pause integration', () => {
  let db: ReturnType<typeof createSqliteDb>;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(input.loadAt);
    db = createSqliteDb(':memory:');
  });
  afterEach(() => {
    db.close();
    vi.useRealTimers();
  });

  function service(mode: 'REQUIRED' | 'ADVISORY' | 'DISABLED' = 'REQUIRED') {
    return new TimedTargetSequenceService(
      new SqliteTimedTargetSequenceRepository(db),
      { publish: vi.fn() },
      'REQUIRED',
      undefined,
      new TimedTargetCommandPause(new SqliteCommandObservationRepository(db), mode),
    );
  }

  it('uses actual UNLOAD, restores the gate and rejects an early next LOAD', () => {
    const first = service();
    const started = first.start(input);
    vi.setSystemTime(new Date(started.completesAt.getTime() + 10_000));
    const observedAt = new Date();
    expect(() => first.start({ ...input, sequenceId: 'second', loadAt: new Date(Date.now() + 120_000) })).toThrow(
      'UNLOAD',
    );
    const state = first.recordUnload({
      observationId: 'command',
      sequenceId: 'first',
      officialName: 'CRO',
      occurredAt: observedAt,
    });
    expect(state.nextLoadAllowedAt.getTime()).toBe(observedAt.getTime() + 60_000);
    first.dispose();
    const restored = service();
    restored.restore();
    expect(restored.getState()?.commandPause).toMatchObject({
      unloadAt: observedAt.toISOString(),
      officialName: 'CRO',
      blocked: true,
    });
    expect(() =>
      restored.start({ ...input, sequenceId: 'second', loadAt: new Date(observedAt.getTime() + 59_999) }),
    ).toThrow('UNLOAD');
    expect(
      restored.start({
        ...input,
        sequenceId: 'second',
        seriesIndex: 1,
        loadAt: new Date(observedAt.getTime() + 60_000),
      }).phase,
    ).toBe('ARMED');
    restored.dispose();
  });

  it('preserves idempotent evidence and rejects changed IDs and mutable history', () => {
    const control = service();
    const started = control.start(input);
    vi.setSystemTime(new Date(started.completesAt.getTime() + 10_000));
    const observation = { observationId: 'command', sequenceId: 'first', officialName: 'CRO', occurredAt: new Date() };
    control.recordUnload(observation);
    control.recordUnload(observation);
    const repository = new SqliteCommandObservationRepository(db);
    expect(repository.findBySequence('first')).toHaveLength(1);
    expect(() => control.recordUnload({ ...observation, officialName: 'Other' })).toThrow('different evidence');
    expect(() => db.prepare('DELETE FROM official_command_observations').run()).toThrow('append-only');
    expect(() => db.prepare("UPDATE official_command_observations SET competition_id = 'other'").run()).toThrow(
      'append-only',
    );
    control.dispose();
  });

  it.each(['ADVISORY', 'DISABLED'] as const)('keeps the independent technical pause in %s mode', (mode) => {
    const control = service(mode);
    const started = control.start(input);
    vi.setSystemTime(new Date(started.completesAt.getTime() + 10_000));
    expect(control.getState()?.commandPause).toMatchObject({ mode, blocked: false, unloadAt: null });
    expect(control.start({ ...input, sequenceId: 'second', loadAt: started.nextLoadAllowedAt }).phase).toBe('ARMED');
    control.dispose();
  });

  it('requires completion, rejects future timestamps, and supports cancelled sequences', () => {
    const control = service();
    control.start(input);
    const observation = { observationId: 'command', sequenceId: 'first', officialName: 'CRO', occurredAt: new Date() };
    expect(() => control.recordUnload(observation)).toThrow('Complete or cancel');
    control.cancel({ sequenceId: 'first', reason: 'Safety stop' });
    expect(() => control.recordUnload({ ...observation, occurredAt: new Date(Date.now() + 60_000) })).toThrow(
      'five seconds',
    );
    expect(control.recordUnload(observation).nextLoadAllowedAt.getTime()).toBe(Date.now() + 60_000);
    control.dispose();
  });

  it('migrates an existing version-15 database without rewriting its other tables', () => {
    const directory = mkdtempSync(join(tmpdir(), 'saika-command-pause-'));
    const file = join(directory, 'lane.db');
    try {
      const previous = new Database(file);
      new MigrationRunner(previous).run(allMigrations.slice(0, 15));
      expect(previous.pragma('user_version', { simple: true })).toBe(15);
      previous.exec(
        "CREATE TABLE retained_v15_evidence (id TEXT PRIMARY KEY, evidence TEXT NOT NULL); INSERT INTO retained_v15_evidence VALUES ('original', 'unchanged')",
      );
      previous.exec(`INSERT INTO shot_observations (id, x, y, device_score_x10, fired_at, received_at, reported_mode)
        VALUES ('observation', 1.25, -2.5, 100, '2026-09-07T12:00:00Z', '2026-09-07T12:00:01Z', 'MATCH')`);
      const existingObservation = previous.prepare('SELECT * FROM shot_observations').get();
      previous.close();
      const upgraded = createSqliteDb(file);
      try {
        expect(upgraded.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(16);
        expect(new SqliteCommandObservationRepository(upgraded).findBySequence('new')).toEqual([]);
        expect(upgraded.prepare('SELECT * FROM shot_observations').get()).toEqual({
          ...(existingObservation as Record<string, unknown>),
          timestamp_source: 'UNKNOWN',
        });
        expect(upgraded.prepare('SELECT * FROM retained_v15_evidence').all()).toEqual([
          { id: 'original', evidence: 'unchanged' },
        ]);
      } finally {
        upgraded.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('does not apply the qualification UNLOAD rule to RFPM or Finals', () => {
    expect(
      ISSF_2026_STDP.capabilities.timedTarget!.programs.every((value) => value.unloadPause?.minimumSeconds === 60),
    ).toBe(true);
    for (const pack of [ISSF_2026_RFPM, ISSF_2026_P25_FINAL]) {
      expect(pack.capabilities.timedTarget!.programs.every((value) => !value.unloadPause)).toBe(true);
    }
  });
});
