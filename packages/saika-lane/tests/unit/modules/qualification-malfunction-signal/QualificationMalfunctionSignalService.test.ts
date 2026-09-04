// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import {
  QualificationMalfunctionSignalService,
  SqliteQualificationMalfunctionSignalRepository,
} from '@/main/modules/qualification-malfunction-signal';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';

const context = {
  competitionId: 'b2222222-2222-4222-a222-222222222222',
  sessionId: 'c3333333-3333-4333-a333-333333333333',
  participantId: 'd4444444-4444-4444-a444-444444444444',
  participantName: 'Test Athlete',
  startNumber: '12',
  phase: 'MATCH' as const,
  stageIndex: 1,
  seriesIndex: 2,
  seriesShotLimit: 5,
  recordedShots: 3,
  timedTargetProgramId: 'issf-pistol-25-rapid-8s',
  exposureIndex: 2,
};

describe('QualificationMalfunctionSignalService', () => {
  it('persists an immutable declaration snapshot and its clearance', () => {
    const database = createSqliteDb(':memory:');
    const repository = new SqliteQualificationMalfunctionSignalRepository(database);
    const service = new QualificationMalfunctionSignalService(repository);

    const active = service.signal({ context, message: 'Possible failure to fire' });
    expect(active).toMatchObject({ status: 'ACTIVE', context, message: 'Possible failure to fire' });
    expect(Object.isFrozen(active.context)).toBe(true);
    expect(() => service.signal({ context })).toThrow('already active');

    const cleared = service.clear({ signalId: active.signalId, clearedBy: 'Lane user' });
    expect(cleared).toMatchObject({ status: 'CLEARED', signalId: active.signalId, context });
    expect(new QualificationMalfunctionSignalService(repository).getState()).toMatchObject({
      status: 'CLEARED',
      signalId: active.signalId,
      context,
    });
    expect(() =>
      database.prepare('UPDATE qualification_malfunction_signal_events SET message = ?').run('changed'),
    ).toThrow('append-only');
    database.close();
  });

  it('does not classify the declaration or own competition-control state', () => {
    const database = createSqliteDb(':memory:');
    const service = new QualificationMalfunctionSignalService(
      new SqliteQualificationMalfunctionSignalRepository(database),
    );

    const active = service.signal({ context: { ...context, phase: 'SIGHTING' } });

    expect(active).not.toHaveProperty('classification');
    expect(active).not.toHaveProperty('claimAssessment');
    expect(active).not.toHaveProperty('timer');
    database.close();
  });

  it('rejects inconsistent shot and timed-target context', () => {
    const database = createSqliteDb(':memory:');
    const service = new QualificationMalfunctionSignalService(
      new SqliteQualificationMalfunctionSignalRepository(database),
    );

    expect(() => service.signal({ context: { ...context, recordedShots: 6 } })).toThrow(
      'recordedShots cannot exceed seriesShotLimit',
    );
    expect(() => service.signal({ context: { ...context, timedTargetProgramId: null, exposureIndex: 1 } })).toThrow(
      'requires a timed-target program',
    );
    database.close();
  });
});
