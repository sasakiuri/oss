import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StoredReviewSubjects } from '@/main/modules/observation-reviews/application/StoredReviewSubjects';
import { ObservationReviewService } from '@/main/modules/observation-reviews/application/ObservationReviewService';
import { ObservationReviewPublicationBlocker } from '@/main/modules/observation-reviews/application/ObservationReviewPublicationBlocker';
import { SqliteObservationReviewRepository } from '@/main/modules/observation-reviews/infra/SqliteObservationReviewRepository';
import type { IFiringWindowJournal } from '@/main/modules/mqtt';
import { SqliteShotObservationEvidenceJournal } from '@/main/modules/mqtt/infra/SqliteShotObservationEvidenceJournal';
import {
  ShotObservationEvidencePayloadSchema,
  type ShotObservationEvidencePayload,
} from '@sasakiuri/saika-protocol/Shots';

import { migratedDatabase } from '../../../../../helpers/database';

const evidence: ShotObservationEvidencePayload = {
  evidenceVersion: 1,
  evidenceId: '11111111-1111-4111-8111-111111111111',
  observationId: '22222222-2222-4222-8222-222222222222',
  outcomeId: '11111111-1111-4111-8111-111111111111',
  laneId: '33333333-3333-4333-8333-333333333333',
  outcome: 'REJECTED_COMPETITION_PHASE',
  x: 1,
  y: 2,
  deviceScoreX10: 104,
  firedAt: '2026-08-31T01:00:00.000Z',
  receivedAt: '2026-08-31T01:00:00.010Z',
  reportedMode: 'MATCH',
  rawFrameHex: 'aabb',
  decidedAt: '2026-08-31T01:00:00.020Z',
  sessionId: '44444444-4444-4444-8444-444444444444',
  detail: 'phase=SERIES_COMPLETE',
  competition: {
    competitionId: '55555555-5555-4555-8555-555555555555',
    phase: 'SERIES_COMPLETE',
    stageIndex: 1,
    seriesIndex: 5,
    stageScored: true,
  },
  publishedAt: '2026-08-31T01:00:01.000Z',
};

describe('SqliteShotObservationEvidenceJournal', () => {
  let database: Database.Database;
  let journal: SqliteShotObservationEvidenceJournal;

  beforeEach(() => {
    database = migratedDatabase();
    journal = new SqliteShotObservationEvidenceJournal(database);
  });

  afterEach(() => database.close());

  it('deduplicates replayed evidence and keeps the unscored payload append-only', () => {
    const payloadJson = JSON.stringify(evidence);
    const record = { evidence, observedAt: new Date('2026-08-31T01:00:02.000Z'), payloadJson };
    journal.append(record);
    journal.append({ ...record, observedAt: new Date('2026-08-31T01:00:03.000Z') });

    expect(journal.findByCompetition(evidence.competition!.competitionId)).toEqual([record]);
    expect(() =>
      database.prepare('DELETE FROM mqtt_shot_observation_evidence WHERE evidence_id = ?').run(evidence.evidenceId),
    ).toThrow('append-only');
  });

  it.each(['QUALIFICATION', 'FINAL'] as const)(
    'admits extras and holds %s publication until official review without a scoring change',
    async (scope) => {
      const extra = ShotObservationEvidencePayloadSchema.parse({
        ...evidence,
        outcome: 'NULLIFIED_POSITION_EXTRA',
        detail: 'Nullified extra — previous Kneeling position · ISSF 6.10.4(c) / 7.7.3',
      });
      journal.append({ evidence: extra, observedAt: new Date(), payloadJson: JSON.stringify(extra) });
      const source = new StoredReviewSubjects(journal, {
        findViolationsByCompetition: () => [],
      } as unknown as IFiringWindowJournal);
      const service = new ObservationReviewService(source, new SqliteObservationReviewRepository(database), {
        issue: () => null,
      });
      const blocker = new ObservationReviewPublicationBlocker(service, () => [extra.competition!.competitionId]);
      expect(await blocker.getIssues('event', scope)).toHaveLength(1);
      const subject = source.list(extra.competition!.competitionId)[0]!;
      expect(subject.kind).toBe('NULLIFIED_POSITION_EXTRA');
      service.record({
        id: 'review-extra',
        competitionId: subject.competitionId,
        subjectId: subject.id,
        subjectRevision: subject.revision,
        previousReviewId: null,
        action: 'NO_SCORE_CHANGE',
        correctionId: null,
        officialName: 'Jury',
        statement: 'Extra reviewed; any Final deduction is a separate Jury decision',
      });
      expect(await blocker.getIssues('event', scope)).toEqual([]);
      expect(journal.findByCompetition(subject.competitionId)[0]!.evidence).toEqual(extra);
    },
  );

  it.each(['LANE_RECEIPT', 'DEVICE_REPORTED', 'UNKNOWN'] as const)(
    'retains %s provenance after transport and reload',
    (timestampSource) => {
      const payloadJson = JSON.stringify({ ...evidence, timestampSource });
      journal.append({
        evidence: ShotObservationEvidencePayloadSchema.parse(JSON.parse(payloadJson)),
        payloadJson,
        observedAt: new Date(),
      });
      expect(journal.findByCompetition(evidence.competition!.competitionId)[0]?.evidence.timestampSource).toBe(
        timestampSource,
      );
      expect(() => ShotObservationEvidencePayloadSchema.parse({ ...evidence, timestampSource: 'INFERRED' })).toThrow();
    },
  );
});
