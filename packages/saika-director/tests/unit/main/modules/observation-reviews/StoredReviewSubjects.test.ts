import { expect, it } from 'vitest';
import type { IFiringWindowJournal, IShotObservationEvidenceJournal } from '@/main/modules/mqtt';
import type { ShotObservationEvidencePayload } from '@/shared/mqtt';
import { StoredReviewSubjects } from '@/main/modules/observation-reviews/StoredReviewSubjects';

it('keeps each unscored outcome separate from detections and excludes recorded shots', () => {
  const evidence = {
    evidenceId: 'e1',
    laneId: 'lane',
    outcome: 'QUARANTINED_TIMING_REVIEW',
    firedAt: '2026-09-09T00:00:00Z',
    competition: { competitionId: 'competition' },
    detail: 'Unknown bounds',
  } as ShotObservationEvidencePayload;
  const observations: IShotObservationEvidenceJournal = {
    append: () => {},
    findByCompetition: () =>
      [
        evidence,
        { ...evidence, evidenceId: 'recorded', outcome: 'RECORDED' as const },
        { ...evidence, competition: null },
      ].map((item) => ({ evidence: item, observedAt: new Date(), payloadJson: JSON.stringify(item) })),
  };
  const windows = {
    findViolationsByCompetition: () => [
      {
        id: 'window',
        competitionId: 'competition',
        laneId: 'lane',
        kind: 'AFTER_MATCH_STOP',
        ruleReference: '6.11.1.3',
        reviewGuidance: 'Identify the shot',
        firedAt: new Date('2026-09-09T00:00:01Z'),
      },
    ],
  } as unknown as IFiringWindowJournal;
  const source = new StoredReviewSubjects(observations, windows);
  expect(source.list('competition').map((item) => item.id)).toEqual(['observation:e1', 'window:window']);
  const before = source.list('competition')[0]!.revision;
  evidence.detail = 'Updated evidence';
  expect(source.list('competition')[0]!.revision).not.toBe(before);
});
