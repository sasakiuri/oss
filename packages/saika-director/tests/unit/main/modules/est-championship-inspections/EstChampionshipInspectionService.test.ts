import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { allMigrations } from '@/main/infrastructure/database/migrations';
import { MigrationRunner } from '@/main/infrastructure/database/migrations/MigrationRunner';
import {
  EstChampionshipInspectionService,
  SqliteEstChampionshipInspectionRepository,
} from '@/main/modules/est-championship-inspections';

const CHAMPIONSHIP_ID = '11111111-1111-4111-8111-111111111111';

describe('EstChampionshipInspectionService', () => {
  let database: Database.Database | undefined;

  afterEach(() => database?.close());

  function setup() {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    new MigrationRunner(database).run(allMigrations);
    database
      .prepare('INSERT INTO championships (id, name, date, venue) VALUES (?, ?, ?, ?)')
      .run(CHAMPIONSHIP_ID, 'ISSF Championship', '2026-09-02', 'Range A');
    return new EstChampionshipInspectionService(new SqliteEstChampionshipInspectionRepository(database));
  }

  it('requires a current pass for every target under named Technical Delegate supervision', async () => {
    const service = setup();
    let assessment = await service.createPlan({
      championshipId: CHAMPIONSHIP_ID,
      targetIdentifiers: ['EST-01', 'EST-02'],
      methodStatement: 'Normal conditions accuracy test',
      createdBy: 'Technical Officer',
    });
    expect(assessment).toMatchObject({ ready: false, ruleReference: 'ISSF 6.3.2.8' });

    assessment = await service.record({
      planId: assessment.plan!.id,
      targetIdentifiers: ['EST-01', 'EST-02'],
      outcome: 'PASSED',
      statement: 'Scoring matched the calibrated test shots',
      evidenceReference: 'CAL-2026-09-A',
      performedBy: 'Target Technician',
      technicalDelegateName: 'TD A',
      inspectedAt: '2026-09-02T05:00:00.000Z',
    });
    expect(assessment.ready).toBe(true);
    expect(assessment.targets.every((target) => target.status === 'PASSED')).toBe(true);

    assessment = await service.record({
      planId: assessment.plan!.id,
      targetIdentifiers: ['EST-02'],
      outcome: 'FAILED',
      statement: 'Accuracy drift detected',
      performedBy: 'Target Technician',
      technicalDelegateName: 'TD A',
      inspectedAt: '2026-09-02T05:30:00.000Z',
    });
    expect(assessment.ready).toBe(false);
    expect(assessment.targets[1]?.status).toBe('FAILED');

    assessment = await service.revoke({
      planId: assessment.plan!.id,
      entryId: assessment.targets[1]!.latestEntry!.id,
      statement: 'The drift reading came from the wrong calibration profile',
      performedBy: 'Target Technician',
      technicalDelegateName: 'TD A',
    });
    expect(assessment.ready).toBe(true);
    expect(assessment.targets[1]?.status).toBe('PASSED');
  });

  it('uses only the latest versioned target plan for championship readiness', async () => {
    const service = setup();
    const first = await service.createPlan({
      championshipId: CHAMPIONSHIP_ID,
      targetIdentifiers: ['EST-01'],
      methodStatement: 'Initial target set',
      createdBy: 'Official A',
    });
    const revised = await service.createPlan({
      championshipId: CHAMPIONSHIP_ID,
      targetIdentifiers: ['EST-01', 'EST-RESERVE'],
      methodStatement: 'Added reserve target',
      createdBy: 'Official B',
    });

    expect(first.plan?.versionNumber).toBe(1);
    expect(revised.plan?.versionNumber).toBe(2);
    expect((await service.get(CHAMPIONSHIP_ID)).targets.map((target) => target.targetIdentifier)).toEqual([
      'EST-01',
      'EST-RESERVE',
    ]);
  });
});
