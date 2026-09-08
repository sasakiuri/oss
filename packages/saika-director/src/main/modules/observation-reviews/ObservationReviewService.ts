import { createHash } from 'node:crypto';

export interface ReviewSubject {
  readonly id: string;
  readonly competitionId: string;
  readonly laneId: string;
  readonly kind: string;
  readonly occurredAt: string;
  readonly detail: string;
  readonly evidenceReference: string;
  readonly revision: string;
}
export interface ObservationReview {
  readonly id: string;
  readonly competitionId: string;
  readonly subjectId: string;
  readonly subjectRevision: string;
  readonly previousReviewId: string | null;
  readonly action: 'NO_SCORE_CHANGE' | 'SCORE_CORRECTION' | 'REOPEN';
  readonly correctionId: string | null;
  readonly officialName: string;
  readonly statement: string;
  readonly recordedAt: string;
}
export interface IObservationReviewRepository {
  transaction<T>(work: () => T): T;
  list(competitionId: string): readonly ObservationReview[];
  append(review: ObservationReview): void;
}
export interface IReviewSubjectSource {
  list(competitionId: string): readonly ReviewSubject[];
}
export interface IReviewCorrectionSource {
  /** Return an issue unless a current, applied correction explicitly covers this evidence. */
  issue(subject: ReviewSubject, correctionId: string): string | null;
}
export type RecordObservationReview = Omit<ObservationReview, 'recordedAt'>;

/** Human review owns neither target evidence nor scoring. Resolutions are independently revocable. */
export class ObservationReviewService {
  constructor(
    private readonly subjects: IReviewSubjectSource,
    private readonly repository: IObservationReviewRepository,
    private readonly corrections: IReviewCorrectionSource,
    private readonly now: () => Date = () => new Date(),
    private readonly competitions: (eventId: string, scope: 'QUALIFICATION' | 'FINAL') => readonly string[] = () => [],
  ) {}

  listEvent(eventId: string, scope: 'QUALIFICATION' | 'FINAL') {
    return [...new Set(this.competitions(eventId, scope))].flatMap((id) => this.list(id));
  }

  list(competitionId: string) {
    const history = this.repository.list(competitionId);
    return this.subjects.list(competitionId).map((subject) => {
      const reviews = history.filter((review) => review.subjectId === subject.id);
      const latest = reviews.at(-1) ?? null;
      let issue: string | null = !latest || latest.action === 'REOPEN' ? 'Awaiting official review' : null;
      if (latest && latest.subjectRevision !== subject.revision) issue = 'Evidence changed; review again';
      if (!issue && latest?.action === 'SCORE_CORRECTION')
        issue = this.corrections.issue(subject, latest.correctionId!);
      return { subject, reviews, latest, resolved: issue === null, issue };
    });
  }

  record(input: RecordObservationReview) {
    return this.repository.transaction(() => {
      const existing = this.repository.list(input.competitionId).find((review) => review.id === input.id);
      if (existing) {
        const { recordedAt: _time, ...saved } = existing;
        if (reviewDigest(saved) !== reviewDigest(input)) throw new Error('Review ID is bound to different evidence');
        return this.list(input.competitionId);
      }
      const item = this.list(input.competitionId).find((value) => value.subject.id === input.subjectId);
      if (!item) throw new Error('Review evidence does not belong to this competition');
      if (item.subject.revision !== input.subjectRevision || (item.latest?.id ?? null) !== input.previousReviewId)
        throw new Error('Evidence or review changed; reload before recording a decision');
      if (!input.officialName.trim() || !input.statement.trim())
        throw new Error('Official and review statement are required');
      if (input.action === 'REOPEN' && !item.latest) throw new Error('There is no decision to reopen');
      if (input.action === 'SCORE_CORRECTION') {
        if (!input.correctionId) throw new Error('Select an applied score correction');
        const issue = this.corrections.issue(item.subject, input.correctionId);
        if (issue) throw new Error(issue);
      } else if (input.correctionId) throw new Error('Only a scoring resolution may reference a correction');
      this.repository.append({ ...input, recordedAt: this.now().toISOString() });
      return this.list(input.competitionId);
    });
  }
}
export function reviewDigest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
