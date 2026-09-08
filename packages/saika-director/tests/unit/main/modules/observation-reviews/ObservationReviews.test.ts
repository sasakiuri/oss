import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { migration079ObservationReviews } from '@/main/infrastructure/database/migrations/079_observation_reviews';
import {
  ObservationReviewService,
  type ReviewSubject,
} from '@/main/modules/observation-reviews/ObservationReviewService';
import { SqliteObservationReviewRepository } from '@/main/modules/observation-reviews/SqliteObservationReviewRepository';
import { ObservationReviewPublicationBlocker } from '@/main/modules/observation-reviews/ObservationReviewPublicationBlocker';
import { OptionalResultPublicationBlocker } from '@/main/modules/result-publication';

const databases: Database.Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});
function fixture() {
  const db = new Database(':memory:');
  databases.push(db);
  migration079ObservationReviews.up(db);
  const subject: ReviewSubject = {
    id: 'observation:evidence',
    competitionId: 'competition',
    laneId: 'lane',
    kind: 'QUARANTINED_TIMING_REVIEW',
    occurredAt: '2026-09-09T00:00:00Z',
    detail: 'Unknown time bounds',
    evidenceReference: 'observation:evidence',
    revision: 'v1',
  };
  const subjects = [subject];
  let correctionIssue: string | null = null;
  const repository = new SqliteObservationReviewRepository(db);
  const source = { list: (id: string) => subjects.filter((item) => item.competitionId === id) };
  const service = new ObservationReviewService(source, repository, { issue: () => correctionIssue });
  const blocker = new ObservationReviewPublicationBlocker(service, (event, scope) =>
    event === 'event' && scope === 'QUALIFICATION' ? ['competition'] : [],
  );
  const request = {
    id: 'review1',
    competitionId: 'competition',
    subjectId: subject.id,
    subjectRevision: 'v1',
    previousReviewId: null,
    action: 'NO_SCORE_CHANGE' as const,
    correctionId: null,
    officialName: 'Jury A',
    statement: 'Independent target record confirms a sighting shot',
  };
  return {
    db,
    subject,
    subjects,
    repository,
    service,
    blocker,
    request,
    changeCorrection: (issue: string) => {
      correctionIssue = issue;
    },
  };
}
describe('Observation reviews', () => {
  it('holds previously unregistered evidence, scopes the hold and preserves explicit review history across restart', () => {
    const f = fixture();
    expect(f.blocker.getIssues('event', 'QUALIFICATION')).toHaveLength(1);
    expect(f.blocker.getIssues('event', 'FINAL')).toEqual([]);
    f.service.record(f.request);
    expect(f.blocker.getIssues('event', 'QUALIFICATION')).toEqual([]);
    expect(f.service.record(f.request)[0]!.reviews).toHaveLength(1);
    expect(new SqliteObservationReviewRepository(f.db).list('competition')).toHaveLength(1);
    expect(() => f.db.exec('DELETE FROM observation_reviews')).toThrow(/append-only/);
    expect(() => f.db.exec("UPDATE observation_reviews SET snapshot_json = '{}' ")).toThrow(/append-only/);
    f.service.record({ ...f.request, id: 'review2', previousReviewId: 'review1', action: 'REOPEN' });
    expect(f.blocker.getIssues('event', 'QUALIFICATION')).toHaveLength(1);
    expect(f.service.list('competition')[0]!.reviews).toHaveLength(2);
  });
  it('rejects concurrent decisions, wrong scope, changed evidence and altered retries', () => {
    const f = fixture();
    f.service.record(f.request);
    expect(() => f.service.record({ ...f.request, id: 'stale' })).toThrow(/changed/);
    expect(() => f.service.record({ ...f.request, statement: 'Different' })).toThrow(/different evidence/);
    expect(() => f.service.record({ ...f.request, competitionId: 'other' })).toThrow(/does not belong/);
    f.subjects[0] = { ...f.subject, revision: 'v2' };
    expect(f.blocker.getIssues('event', 'QUALIFICATION')[0]).toMatch(/Evidence changed/);
  });
  it('rechecks correction withdrawal/staleness and supports independent publication policy', async () => {
    const f = fixture();
    f.service.record({ ...f.request, action: 'SCORE_CORRECTION', correctionId: 'correction' });
    expect(f.blocker.getIssues('event', 'QUALIFICATION')).toEqual([]);
    f.changeCorrection('Correction withdrawn');
    expect(f.blocker.getIssues('event', 'QUALIFICATION')[0]).toMatch(/withdrawn/);
    const optional = new OptionalResultPublicationBlocker(f.blocker, () => false);
    expect(await optional.getIssues('event', 'QUALIFICATION')).toEqual([]);
    expect(f.service.list('competition')[0]!.resolved).toBe(false);
  });
  it('does not let a previous review cover later evidence or require an existing case', () => {
    const f = fixture();
    f.service.record(f.request);
    f.subjects.push({ ...f.subject, id: 'observation:new', evidenceReference: 'observation:new' });
    expect(f.blocker.getIssues('event', 'QUALIFICATION')).toHaveLength(1);
  });
});
