// SPDX-License-Identifier: MIT
// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migration003CreateSchema } from '@/main/infrastructure/database/migrations/003_create_schema';
import { migration044EventRulePackBinding } from '@/main/infrastructure/database/migrations/044_event_rule_pack_binding';
import { ChampionshipId } from '@/main/modules/championship/domain/ChampionshipId';
import { Event } from '@/main/modules/championship/domain/Event';
import { EventId } from '@/main/modules/championship/domain/EventId';
import { EventType } from '@/main/modules/championship/domain/EventType';
import { SqliteEventRepository } from '@/main/modules/championship/infra/SqliteEventRepository';
import { Round } from '@/main/modules/lane-control';
import { CompetitionTypeRegistry, type CompetitionTypeDefinition } from '@/shared/competitionTypes';

const competitionType: CompetitionTypeDefinition = {
  id: 'TEST:RULE-PACK',
  name: 'Test Rule Pack event',
  scoring: { minScore: 0, maxScore: 10, precision: 0 },
  config: {
    name: 'Qualification',
    maxChannels: 1,
    hasRelay: true,
    stages: [],
  },
  rankingStrategyId: 'test',
  displayHints: { shortName: 'TEST', description: 'Test' },
  resultFormat: { totalShots: 0, totalSeries: 0 },
};

const identity = {
  id: 'ISSF:2026:TEST',
  schemaVersion: 1,
  fingerprint: { algorithm: 'SHA-256', value: 'a'.repeat(64) },
} as const;

describe('SqliteEventRepository Rule Pack binding', () => {
  let database: Database.Database;
  let repository: SqliteEventRepository;
  let registry: CompetitionTypeRegistry;
  const championshipId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    migration003CreateSchema.up(database);
    migration044EventRulePackBinding.up(database);
    database
      .prepare('INSERT INTO championships (id, name, date, venue) VALUES (?, ?, ?, ?)')
      .run(championshipId, 'Championship', '2026-09-01', 'Range');
    registry = new CompetitionTypeRegistry();
    registry.register(competitionType);
    repository = new SqliteEventRepository(database, registry);
  });

  afterEach(() => database.close());

  it('round-trips the exact immutable Rule Pack identity', () => {
    const event = Event.create(
      EventId.create('22222222-2222-4222-8222-222222222222'),
      ChampionshipId.create(championshipId),
      '50m Final',
      EventType.create(competitionType.id, registry),
      Round.create('Final'),
      3,
      identity,
    );

    repository.save(event);

    expect(repository.findById(event.id.value)?.rulePackIdentity).toEqual(identity);
  });

  it('allows legacy unbound events but rejects a partially populated binding', () => {
    const event = Event.create(
      EventId.create('33333333-3333-4333-8333-333333333333'),
      ChampionshipId.create(championshipId),
      'Local event',
      EventType.create(competitionType.id, registry),
      Round.create('Qualification'),
    );
    repository.save(event);
    expect(repository.findById(event.id.value)?.rulePackIdentity).toBeNull();

    expect(() =>
      database.prepare('UPDATE events SET rule_pack_id = ? WHERE id = ?').run('incomplete', event.id.value),
    ).toThrow('Event Rule Pack binding must be complete');
  });
});
