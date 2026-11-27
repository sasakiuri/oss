import type { IResultPublicationBlocker } from '@/main/modules/result-publication';
import type { ObservationReviewService } from './ObservationReviewService';

export class ObservationReviewPublicationBlocker implements IResultPublicationBlocker {
  constructor(private readonly reviews: Pick<ObservationReviewService, 'listEvent'>) {}
  getIssues(eventId: string, scope: 'QUALIFICATION' | 'FINAL'): string[] {
    return this.reviews
      .listEvent(eventId, scope)
      .filter((item) => !item.resolved)
      .map(
        (item) =>
          `Lane ${item.subject.laneId}: ${item.subject.kind} (${item.subject.evidenceReference}). ${item.issue}`,
      );
  }
}
