// SPDX-License-Identifier: MIT
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AdjudicationCaseService, SqliteAdjudicationCaseRepository } from '@/main/modules/adjudication-cases';

import { migratedDatabase } from '../../../../../helpers/database';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const REPORT_ID = '22222222-2222-4222-8222-222222222222';
const DECISION_ID = '33333333-3333-4333-8333-333333333333';

describe('SqliteAdjudicationCaseRepository', () => {
  let db: Database.Database;
  let repository: SqliteAdjudicationCaseRepository;
  let service: AdjudicationCaseService;

  beforeEach(() => {
    db = migratedDatabase();
    db.pragma('foreign_keys = ON');
    repository = new SqliteAdjudicationCaseRepository(db);
    service = new AdjudicationCaseService(repository);
  });

  afterEach(() => {
    db.close();
  });

  function createCase(subject: string, openedAt: string) {
    return service.create({
      scopeType: 'EVENT',
      scopeId: EVENT_ID,
      category: 'RANGE_INCIDENT',
      subject,
      summary: `${subject} review`,
      openedBy: 'RTS Jury A',
      openedAt,
    });
  }

  it('groups persisted entries and link history by case in recorded order', () => {
    const first = createCase('Disputed shot', '2026-11-28T09:00:00.000Z');
    const second = createCase('Target failure', '2026-11-28T09:05:00.000Z');
    const empty = createCase('Unrelated note', '2026-11-28T09:10:00.000Z');

    service.appendEntry({ caseId: first.id, type: 'REFERRED', statement: 'Sent to Jury.', officialName: 'CRO' });
    service.appendEntry({
      caseId: first.id,
      type: 'RESOLVED',
      statement: 'Score confirmed.',
      officialName: 'RTS Jury A',
      ruleReference: 'ISSF 6.10.8',
    });
    service.appendEntry({ caseId: second.id, type: 'NOTE', statement: 'Target replaced.', officialName: 'CRO' });
    const linked = service.linkArtifact({
      caseId: first.id,
      artifactType: 'RANGE_INCIDENT_REPORT',
      artifactId: REPORT_ID,
      relation: 'REPORT',
      labelSnapshot: 'IR 14',
      statement: 'Primary range report.',
      officialName: 'RTS Jury A',
    });
    service.linkArtifact({
      caseId: first.id,
      artifactType: 'SCORING_DECISION',
      artifactId: DECISION_ID,
      relation: 'DECISION',
      labelSnapshot: 'Decision 3',
      statement: 'Jury decision.',
      officialName: 'RTS Jury A',
    });
    service.unlinkArtifact({
      caseId: first.id,
      linkId: linked.links[0]!.id,
      statement: 'Linked to the wrong incident.',
      officialName: 'RTS Jury A',
    });

    const reloaded = new SqliteAdjudicationCaseRepository(db);
    const entries = reloaded.findEntries([first.id, second.id, empty.id]);
    const links = reloaded.findLinks([first.id, second.id]);

    expect(entries.get(first.id)?.map((entry) => [entry.type, entry.ruleReference])).toEqual([
      ['REFERRED', null],
      ['RESOLVED', 'ISSF 6.10.8'],
    ]);
    expect(entries.get(second.id)?.map((entry) => entry.statement)).toEqual(['Target replaced.']);
    expect(entries.get(empty.id) ?? []).toEqual([]);
    expect(links.get(first.id)?.map((link) => [link.operation, link.artifactId, link.relation])).toEqual([
      ['ADD', REPORT_ID, 'REPORT'],
      ['ADD', DECISION_ID, 'DECISION'],
      ['REMOVE', REPORT_ID, 'REPORT'],
    ]);
    expect(links.get(first.id)?.[2]?.reversesLinkId).toBe(linked.links[0]!.id);
    expect(links.get(second.id) ?? []).toEqual([]);

    const listed = service.list({ scopeType: 'EVENT', scopeId: EVENT_ID });
    expect(listed.map((value) => [value.subject, value.status])).toEqual([
      ['Disputed shot', 'RESOLVED'],
      ['Target failure', 'OPEN'],
      ['Unrelated note', 'OPEN'],
    ]);
    expect(listed[0]?.links.map((link) => link.artifactId)).toEqual([DECISION_ID]);
  });
});
