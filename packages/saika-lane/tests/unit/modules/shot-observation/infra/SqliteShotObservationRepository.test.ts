// SPDX-License-Identifier: MIT
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ShotObservation, createShotObservationOutcome } from '@/main/modules/shot-observation/domain/ShotObservation';
import { SqliteShotObservationRepository } from '@/main/modules/shot-observation/infra/SqliteShotObservationRepository';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';

describe('SqliteShotObservationRepository', () => {
  let database: Database.Database;
  let repository: SqliteShotObservationRepository;

  beforeEach(() => {
    database = createSqliteDb(':memory:');
    repository = new SqliteShotObservationRepository(database);
  });

  afterEach(() => database.close());

  it('round-trips immutable pre-rule evidence and append-only outcomes', async () => {
    const observation = ShotObservation.create({
      x: 1.25,
      y: -0.75,
      deviceScoreX10: 98.5,
      firedAt: new Date('2026-08-28T00:00:00.000Z'),
      receivedAt: new Date('2026-08-28T00:00:00.020Z'),
      reportedMode: 'MATCH',
      rawFrameHex: 'aabbcc',
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
    });
    expect(restored?.firedAt.toISOString()).toBe('2026-08-28T00:00:00.000Z');
    expect(restored?.receivedAt.toISOString()).toBe('2026-08-28T00:00:00.020Z');
    expect(await repository.findOutcomes(observation.id)).toEqual([outcome]);
  });
});
