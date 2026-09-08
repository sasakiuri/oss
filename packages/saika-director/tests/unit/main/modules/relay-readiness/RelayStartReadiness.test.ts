import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { allMigrations } from '@/main/infrastructure/database/migrations';
import { MigrationRunner } from '@/main/infrastructure/database/migrations/MigrationRunner';
import {
  RelayReadinessService,
  SqliteRelayReadinessRepository,
  SqliteRelayStartSettingsRepository,
} from '@/main/modules/relay-readiness';
import { CompetitionStartReadiness } from '@/main/shared-infra/operations/CompetitionStartReadiness';

const scope = { competitionId: 'competition-a', phase: 'SIGHTING' as const, laneIds: ['lane-a'] };

describe('Relay start enforcement', () => {
  let db: Database.Database;
  let service: RelayReadinessService;
  let guard: CompetitionStartReadiness;
  const connect = () => {
    service = new RelayReadinessService(
      new SqliteRelayReadinessRepository(db),
      undefined,
      new SqliteRelayStartSettingsRepository(db),
    );
    guard = new CompetitionStartReadiness([service]);
  };
  beforeEach(() => {
    db = new Database(':memory:');
    new MigrationRunner(db).run(allMigrations);
    connect();
  });
  afterEach(() => db.close());

  async function confirmRelay(relayNumber: number) {
    const assessment = await service.assess({ ...scope, relayNumber });
    for (const item of assessment.items)
      await service.record({
        competitionId: scope.competitionId,
        relayNumber,
        phase: item.phase,
        laneId: item.laneId,
        requirement: item.requirement,
        state: 'CONFIRMED',
        source: 'MANUAL',
        statement: 'Checked',
        officialName: 'Range Officer',
      });
  }

  it('persists the chosen relay and refuses confirmations from another relay, phase, or Lane', async () => {
    expect(() => guard.assertAllowed(scope)).not.toThrow();
    service.setStartSettings({ competitionId: scope.competitionId, relayNumber: 2, mode: 'REQUIRED' });
    await confirmRelay(1);
    connect();
    expect(() => guard.assertAllowed(scope)).toThrow('Relay 2');
    await confirmRelay(2);
    expect(() => guard.assertAllowed(scope)).not.toThrow();
    expect(() => guard.assertAllowed({ ...scope, phase: 'MATCH' })).toThrow('Match target mode');
    expect(() => guard.assertAllowed({ ...scope, laneIds: ['lane-a', 'lane-b'] })).toThrow('lane-b');
    expect(() => guard.assertAllowed({ ...scope, competitionId: 'competition-b' })).not.toThrow();
  });

  it('honors a revoked check immediately and lets operators switch to advisory or disabled', async () => {
    service.setStartSettings({ competitionId: scope.competitionId, relayNumber: 1, mode: 'REQUIRED' });
    await confirmRelay(1);
    expect(() => guard.assertAllowed(scope)).not.toThrow();
    await service.record({
      competitionId: scope.competitionId,
      relayNumber: 1,
      phase: 'RELAY',
      requirement: 'BACKUP_MEMORY_READY',
      state: 'REVOKED',
      source: 'MANUAL',
      statement: 'Printer unavailable',
      officialName: 'RO',
    });
    expect(() => guard.assertAllowed(scope)).toThrow('backup-memory');
    service.setStartSettings({ competitionId: scope.competitionId, relayNumber: 1, mode: 'ADVISORY' });
    expect(service.getStartIssues(scope)).toEqual([expect.objectContaining({ blocking: false })]);
    expect(() => guard.assertAllowed(scope)).not.toThrow();
    service.setStartSettings({ competitionId: scope.competitionId, relayNumber: 1, mode: 'DISABLED' });
    expect(service.getStartIssues(scope)).toEqual([]);
  });

  it('allows an independent provider to block even when relay checks are advisory', () => {
    guard = new CompetitionStartReadiness([
      service,
      { getStartIssues: () => [{ code: 'INSPECTION', message: 'Inspection failed', blocking: true }] },
    ]);
    expect(guard.getStartIssues(scope)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ blocking: false }),
        expect.objectContaining({ code: 'INSPECTION', blocking: true }),
      ]),
    );
    expect(() => guard.assertAllowed(scope)).toThrow('Inspection failed');
  });
});
