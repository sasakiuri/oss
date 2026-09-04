import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { allMigrations } from '@/main/infrastructure/database/migrations';
import { MigrationRunner } from '@/main/infrastructure/database/migrations/MigrationRunner';
import {
  CompetitionEvidenceBundleBuilder,
  SqliteCompetitionEvidenceSource,
  canonicalJson,
} from '@/main/modules/operational-archives';

describe('CompetitionEvidenceBundleBuilder', () => {
  let database: Database.Database | undefined;

  afterEach(() => database?.close());

  it('collects every registered section against the current schema and produces stable hashes', () => {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    new MigrationRunner(database).run(allMigrations);
    const championshipId = '11111111-1111-4111-8111-111111111111';
    const eventId = '22222222-2222-4222-8222-222222222222';
    database
      .prepare('INSERT INTO championships (id, name, date, venue) VALUES (?, ?, ?, ?)')
      .run(championshipId, 'ISSF Test', '2026-09-02', 'Range A');
    database
      .prepare(
        `INSERT INTO events (id, championship_id, name, event_type, round, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(eventId, championshipId, '10m Air Rifle', 'AR60', 'Qualification', 1);

    const source = new SqliteCompetitionEvidenceSource(database);
    const builder = new CompetitionEvidenceBundleBuilder('0.3.0', {
      now: () => new Date('2026-09-02T06:00:00.000Z'),
    });
    const first = builder.build(source, championshipId);
    const second = builder.build(source, championshipId);

    expect(first).toEqual(second);
    expect(first.bundleSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.sections.length).toBeGreaterThan(30);
    expect(first.sections.find((section) => section.id === 'events')).toMatchObject({ recordCount: 1 });
    expect(first.sections.find((section) => section.id === 'athlete-identities')).toMatchObject({ recordCount: 0 });
    expect(first.sections.find((section) => section.id === 'athlete-sanction-decisions')).toMatchObject({
      recordCount: 0,
    });
    expect(first.sections.find((section) => section.id === 'qualification-malfunction-cases')).toMatchObject({
      recordCount: 0,
    });
    expect(first.sections.find((section) => section.id === 'qualification-malfunction-entries')).toMatchObject({
      recordCount: 0,
    });
    expect(first.sections.find((section) => section.id === 'post-competition-equipment-checks')).toMatchObject({
      recordCount: 0,
    });
    expect(first.sections.find((section) => section.id === 'post-competition-equipment-check-entries')).toMatchObject({
      recordCount: 0,
    });
    expect(first.sections.every((section) => section.sha256.length === 64)).toBe(true);
  });

  it('canonicalizes object keys recursively', () => {
    expect(canonicalJson({ z: 1, a: { y: 2, b: 3 } })).toBe('{"a":{"b":3,"y":2},"z":1}');
  });
});
