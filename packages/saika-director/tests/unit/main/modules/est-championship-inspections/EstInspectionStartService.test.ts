import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { allMigrations } from '@/main/infrastructure/database/migrations';
import { MigrationRunner } from '@/main/infrastructure/database/migrations/MigrationRunner';
import {
  EstChampionshipInspectionService,
  EstInspectionStartService,
  SqliteEstInspectionStartSettingsRepository,
  SqliteEstChampionshipInspectionRepository,
} from '@/main/modules/est-championship-inspections';
import { CompetitionStartReadiness } from '@/main/shared-infra/operations/CompetitionStartReadiness';

const championshipId = '11111111-1111-4111-8111-111111111111';
const scope = { competitionId: 'competition-a', phase: 'SIGHTING' as const, laneIds: ['lane-a'] };
const settings = {
  competitionId: scope.competitionId,
  championshipId,
  mode: 'REQUIRED' as const,
  laneTargets: [{ laneId: 'lane-a', targetIdentifiers: ['EST-A1', 'EST-A2'] }],
};

describe('EST inspection start checks', () => {
  let db: Database.Database;
  let ledger: EstChampionshipInspectionService;
  let service: EstInspectionStartService;
  let guard: CompetitionStartReadiness;
  beforeEach(() => {
    db = new Database(':memory:');
    new MigrationRunner(db).run(allMigrations);
    db.prepare('INSERT INTO championships (id, name, date, venue) VALUES (?, ?, ?, ?)').run(
      championshipId,
      'Championship',
      '2026-09-08',
      'Range',
    );
    const inspections = new SqliteEstChampionshipInspectionRepository(db);
    ledger = new EstChampionshipInspectionService(inspections);
    service = new EstInspectionStartService(new SqliteEstInspectionStartSettingsRepository(db), inspections);
    guard = new CompetitionStartReadiness([service]);
  });
  afterEach(() => db.close());
  const plan = () =>
    ledger.createPlan({
      championshipId,
      targetIdentifiers: ['EST-A1', 'EST-A2'],
      methodStatement: 'Accuracy test',
      createdBy: 'TD',
    });
  const record = (planId: string, outcome: 'PASSED' | 'FAILED') =>
    ledger.record({
      planId,
      targetIdentifiers: ['EST-A1', 'EST-A2'],
      outcome,
      statement: 'Inspection result',
      performedBy: 'Technician',
      technicalDelegateName: 'TD',
      inspectedAt: new Date().toISOString(),
    });

  it('checks current plan results and all joined Lane bindings, including target banks', async () => {
    expect(() => guard.assertAllowed(scope)).not.toThrow();
    const first = await plan();
    service.saveSettings(settings);
    expect(() => guard.assertAllowed(scope)).toThrow('pending or failed');
    await record(first.plan!.id, 'PASSED');
    expect(() => guard.assertAllowed(scope)).not.toThrow();
    expect(() => guard.assertAllowed({ ...scope, laneIds: ['lane-a', 'reserve-lane'] })).toThrow('reserve-lane');
    expect(() => guard.assertAllowed({ ...scope, competitionId: 'other' })).not.toThrow();
    expect(
      new EstInspectionStartService(
        new SqliteEstInspectionStartSettingsRepository(db),
        new SqliteEstChampionshipInspectionRepository(db),
      ).getSettings(scope.competitionId),
    ).toEqual(settings);
    const revised = await plan();
    expect(() => guard.assertAllowed(scope)).toThrow('plan 2');
    await record(revised.plan!.id, 'PASSED');
    expect(() => guard.assertAllowed(scope)).not.toThrow();
    await record(revised.plan!.id, 'FAILED');
    expect(() => guard.assertAllowed({ ...scope, phase: 'MATCH' })).toThrow('pending or failed');
  });

  it('revokes approval immediately and keeps advisory operation independent', async () => {
    const first = await plan();
    service.saveSettings(settings);
    const result = await record(first.plan!.id, 'PASSED');
    await ledger.revoke({
      planId: first.plan!.id,
      entryId: result.targets[0]!.latestEntry!.id,
      statement: 'Incorrect target measured',
      performedBy: 'Technician',
      technicalDelegateName: 'TD',
    });
    expect(() => guard.assertAllowed(scope)).toThrow('pending or failed');
    service.saveSettings({ ...settings, mode: 'ADVISORY' });
    expect(service.getStartIssues(scope)[0]?.blocking).toBe(false);
    expect(() => guard.assertAllowed(scope)).not.toThrow();
    service.saveSettings({ ...settings, mode: 'DISABLED' });
    expect(service.getStartIssues(scope)).toEqual([]);
  });

  it('rejects unknown or duplicated physical targets', async () => {
    await plan();
    expect(() =>
      service.saveSettings({ ...settings, laneTargets: [{ laneId: 'lane-a', targetIdentifiers: ['unknown'] }] }),
    ).toThrow('current championship inspection plan');
    expect(() =>
      service.saveSettings({
        ...settings,
        laneTargets: [...settings.laneTargets, { laneId: 'lane-b', targetIdentifiers: ['EST-A2'] }],
      }),
    ).toThrow('one Lane');
  });
});
