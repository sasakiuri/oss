import type { IFiringWindowJournal, IShotObservationEvidenceJournal } from '@/main/modules/mqtt';
import { reviewDigest, type IReviewSubjectSource, type ReviewSubject } from './ObservationReviewService';

/** Adapts evidence journals without modifying acquisition or creating scoring decisions. */
export class StoredReviewSubjects implements IReviewSubjectSource {
  constructor(
    private readonly observations: IShotObservationEvidenceJournal,
    private readonly windows: IFiringWindowJournal,
  ) {}
  list(competitionId: string): ReviewSubject[] {
    const observations = this.observations.findByCompetition(competitionId).flatMap(({ evidence }) => {
      if (evidence.outcome === 'RECORDED' || evidence.competition?.competitionId !== competitionId) return [];
      return [
        {
          id: `observation:${evidence.evidenceId}`,
          competitionId,
          laneId: evidence.laneId,
          kind: evidence.outcome,
          occurredAt: evidence.firedAt,
          detail: evidence.detail ?? 'Review the unscored target observation',
          evidenceReference: `observation:${evidence.evidenceId}`,
          revision: reviewDigest(evidence),
        },
      ];
    });
    const windows = this.windows.findViolationsByCompetition(competitionId).map((value) => ({
      id: `window:${value.id}`,
      competitionId,
      laneId: value.laneId,
      kind: value.kind,
      occurredAt: value.firedAt.toISOString(),
      detail: `${value.ruleReference}: ${value.reviewGuidance}`,
      evidenceReference: `window:${value.id}`,
      revision: reviewDigest(value),
    }));
    return [...observations, ...windows].sort(
      (a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
    );
  }
}
