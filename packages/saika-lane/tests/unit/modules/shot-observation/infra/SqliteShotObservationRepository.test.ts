// SPDX-License-Identifier: MIT
// cspell:ignore aabbcc
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ShotObservation, createShotObservationOutcome } from '@/main/modules/shot-observation/domain/ShotObservation';
import {
  createShotObservationEvidence,
  parseShotObservationEvidence,
  serializeShotObservationEvidence,
} from '@/main/modules/shot-observation/domain/ShotObservationEvidence';
import { SqliteShotObservationEvidenceOutbox } from '@/main/modules/shot-observation/infra/SqliteShotObservationEvidenceOutbox';
import { SqliteShotObservationRepository } from '@/main/modules/shot-observation/infra/SqliteShotObservationRepository';
import { allMigrations } from '@/main/shared-infra/sqlite/migrations';
import { MigrationRunner } from '@/main/shared-infra/sqlite/migrations/MigrationRunner';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';

describe('SqliteShotObservationRepository', () => {
  let database: Database.Database;
  let repository: SqliteShotObservationRepository;

  beforeEach(() => {
    database = createSqliteDb(':memory:');
    repository = new SqliteShotObservationRepository(database);
  });

  afterEach(() => database.close());

  it.each(['UNKNOWN', 'LANE_RECEIPT', 'DEVICE_REPORTED'] as const)(
    'preserves %s timestamps with pre-rule evidence',
    async (timestampSource) => {
      const observation = ShotObservation.create({
        x: 1.25,
        y: -0.75,
        deviceScoreX10: 98.5,
        firedAt: new Date('2026-08-28T00:00:00.000Z'),
        receivedAt: new Date('2026-08-28T00:00:00.020Z'),
        reportedMode: 'MATCH',
        rawFrameHex: 'aabbcc',
        timestampSource,
      });
      const outcome = createShotObservationOutcome({
        observationId: observation.id,
        type: 'REJECTED_COMPETITION_PHASE',
        sessionId: 'session-1',
        detail: 'MATCH_COMPLETE',
        decidedAt: new Date('2026-08-28T00:00:00.030Z'),
      });

      await repository.append(observation);
      await repository.appendOutcome(outcome);

      const restored = await repository.findById(observation.id);
      expect(restored).toMatchObject({
        id: observation.id,
        x: 1.25,
        y: -0.75,
        deviceScoreX10: 98.5,
        reportedMode: 'MATCH',
        rawFrameHex: 'aabbcc',
        timestampSource,
      });
      expect(restored?.firedAt.toISOString()).toBe('2026-08-28T00:00:00.000Z');
      expect(restored?.receivedAt.toISOString()).toBe('2026-08-28T00:00:00.020Z');
      expect(await repository.findOutcomes(observation.id)).toEqual([outcome]);
    },
  );

  it('atomically queues an outcome for transport and retains it after acknowledgement', async () => {
    const observation = ShotObservation.create({
      x: 0,
      y: 0,
      deviceScoreX10: 109,
      firedAt: new Date('2026-08-28T00:00:00.000Z'),
      receivedAt: new Date('2026-08-28T00:00:00.010Z'),
      reportedMode: 'MATCH',
      timestampSource: 'LANE_RECEIPT',
    });
    const outcome = createShotObservationOutcome({
      observationId: observation.id,
      type: 'REJECTED_COMPETITION_PHASE',
      sessionId: 'session-1',
      decidedAt: new Date('2026-08-28T00:00:00.020Z'),
    });
    const evidence = createShotObservationEvidence(observation, outcome, {
      competitionId: 'competition-1',
      phase: 'SERIES_COMPLETE',
      stageIndex: 1,
      seriesIndex: 5,
      stageScored: true,
    });
    const outbox = new SqliteShotObservationEvidenceOutbox(database);

    await repository.append(observation);
    await repository.appendOutcomeWithEvidence(outcome, evidence);
    expect(await repository.findOutcomes(observation.id)).toEqual([outcome]);
    expect(await outbox.findPending()).toEqual([evidence]);

    const legacy = JSON.parse(serializeShotObservationEvidence(evidence));
    delete legacy.timestampSource;
    expect(parseShotObservationEvidence(JSON.stringify(legacy))).toMatchObject({ timestampSource: 'UNKNOWN' });
    expect(() => parseShotObservationEvidence(JSON.stringify({ ...legacy, timestampSource: 'INFERRED' }))).toThrow(
      'timestamp source',
    );

    await outbox.markPublished(evidence.evidenceId, new Date('2026-08-28T00:00:01.000Z'));
    expect(await outbox.findPending()).toEqual([]);
    expect(
      database
        .prepare('SELECT payload_json FROM shot_observation_evidence_outbox WHERE evidence_id = ?')
        .get(evidence.evidenceId),
    ).toBeTruthy();
  });

  it('upgrades legacy observations without inventing a device timestamp or losing the original values', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'saika-time-source-'));
    const path = join(directory, 'lane.sqlite');
    try {
      const legacy = new Database(path);
      new MigrationRunner(legacy).run(allMigrations.filter((migration) => migration.version <= 18));
      legacy.exec(`INSERT INTO shot_observations (id, fired_at, received_at)
        VALUES ('legacy-shot', '2026-08-28T00:00:00.000Z', '2026-08-28T00:00:00.020Z');`);
      legacy.close();
      const upgraded = createSqliteDb(path);
      try {
        expect(await new SqliteShotObservationRepository(upgraded).findById('legacy-shot')).toMatchObject({
          timestampSource: 'UNKNOWN',
          firedAt: new Date('2026-08-28T00:00:00.000Z'),
          receivedAt: new Date('2026-08-28T00:00:00.020Z'),
        });
      } finally {
        upgraded.close();
      }
      const reopened = createSqliteDb(path);
      reopened.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
