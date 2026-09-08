import type { IResultPublicationBlocker } from '@/main/modules/result-publication';
import type { ObservationReviewService } from './ObservationReviewService';

export class ObservationReviewPublicationBlocker implements IResultPublicationBlocker {
  constructor(
    private readonly reviews: ObservationReviewService,
    private readonly competitions: (eventId: string, scope: 'QUALIFICATION' | 'FINAL') => readonly string[],
  ) {}
  getIssues(eventId: string, scope: 'QUALIFICATION' | 'FINAL'): string[] {
    return [...new Set(this.competitions(eventId, scope))].flatMap((id) =>
      this.reviews
        .list(id)
        .filter((item) => !item.resolved)
        .map(
          (item) =>
            `Lane ${item.subject.laneId}: ${item.subject.kind} (${item.subject.evidenceReference}). ${item.issue}`,
        ),
    );
  }
}
