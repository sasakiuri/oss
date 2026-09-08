import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { allMigrations } from '@/main/infrastructure/database/migrations';
import { MigrationRunner } from '@/main/infrastructure/database/migrations/MigrationRunner';
import { EstBackupSourceService, SqliteEstBackupSourceRepository } from '@/main/modules/est-backup-sources';
import {
  CompetitionEvidenceBundleBuilder,
  SqliteCompetitionEvidenceSource,
  canonicalJson,
} from '@/main/modules/operational-archives';
import {
  PublicationReviewPolicyService,
  SqlitePublicationReviewPolicyRepository,
} from '@/main/modules/publication-review-policies';

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

    const policy = new PublicationReviewPolicyService(
      new SqlitePublicationReviewPolicyRepository(database),
      () => ({
        requireObservationReviews: true,
        requireIncidentReports: true,
        requireEquipmentChecksComplete: true,
        requireProtestCasesComplete: true,
        requireFinalRecoveriesComplete: true,
      }),
      () => true,
    );
    const settings = policy.get(eventId, 'QUALIFICATION');
    const entry = policy.save({
      eventId,
      resultScope: 'QUALIFICATION',
      mode: 'PINNED',
      settings: settings.effectiveSettings,
      expectedRevision: settings.revision,
      officialName: 'RTS official',
      reason: 'Event publication requirements',
    }).history[0]!;

    const content = '[{"key":"001","totalScore":630.1}]';
    const retained = new EstBackupSourceService(
      new SqliteEstBackupSourceRepository(database),
      (id) => id === eventId,
    ).retain(eventId, content, {
      status: 'IMPORTED',
      fileName: 'backup.json',
      sourceName: 'Memory export',
      sourceReference: 'Memory A',
      sizeBytes: Buffer.byteLength(content),
      sha256: createHash('sha256').update(content).digest('hex'),
      format: 'JSON',
      records: [{ key: '001', totalScore: 630.1 }],
    });
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
    expect(first.sections.find((section) => section.id === 'est-backup-sources')).toMatchObject({
      recordCount: 1,
      records: [{ id: retained.id, event_id: eventId, payload_json: JSON.stringify(retained) }],
    });
    expect(first.sections.find((section) => section.id === 'publication-review-policies')).toMatchObject({
      recordCount: 1,
      records: [{ event_id: eventId, payload_json: JSON.stringify(entry) }],
    });
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
