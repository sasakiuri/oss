import type { IFinalResultsReader } from '@/main/modules/results';
import type {
  FinalPlacementReviewEntryDto,
  FinalPlacementReviewStatusDto,
  RecordFinalPlacementReviewPayload,
  RevokeFinalPlacementReviewPayload,
} from '@/shared/ipc/contracts';

import {
  FinalPlacementReviewEntry,
  findPlacementViolation,
  getCurrentFinalPlacementReview,
} from '../domain/FinalPlacementReviewEntry';
import type { IFinalPlacementReviewRepository } from '../domain/IFinalPlacementReviewRepository';

/** Validates and records explicit Final placements against the current scoring snapshot. */
export class FinalPlacementReviewService {
  constructor(
    private readonly results: IFinalResultsReader,
    private readonly repository: IFinalPlacementReviewRepository,
  ) {}

  async getStatus(eventId: string): Promise<FinalPlacementReviewStatusDto> {
    const snapshot = await this.results.getSnapshot(eventId);
    const history = this.repository.findByEventId(eventId);
    const activeReview = getCurrentFinalPlacementReview(history);
    const activeReviewId = activeReview?.id ?? null;
    const reviewHistory = history.map((entry) =>
      toDto(
        entry,
        entry.type === 'REVIEW' && entry.id === activeReviewId,
        entry.id === snapshot.currentPlacementReviewId,
      ),
    );
    const currentReview = reviewHistory.find((entry) => entry.current) ?? null;
    const issues: string[] = [];
    if (snapshot.results.length === 0) issues.push('No Final results are available');
    if (snapshot.results.some((result) => result.placementReviewRequired)) {
      issues.push('Final placements require review after a score or classification intervention');
    }
    if (activeReview && !currentReview) issues.push('The latest Final placement review is stale or invalid');

    return {
      eventId,
      scoringRevision: snapshot.scoringRevision,
      reviewRequired: snapshot.results.some((result) => result.placementReviewRequired),
      issues,
      results: [...snapshot.results],
      currentReview,
      reviewHistory,
    };
  }

  async record(input: RecordFinalPlacementReviewPayload): Promise<FinalPlacementReviewEntryDto> {
    const snapshot = await this.results.getSnapshot(input.eventId);
    if (snapshot.scoringRevision !== input.scoringRevision) {
      throw new Error('Final scoring changed after this placement form was opened; reload before recording');
    }
    if (snapshot.results.length === 0) throw new Error('No Final results are available');
    const violation = findPlacementViolation(input.placements, snapshot.results);
    if (violation) throw new Error(violation);

    const review = FinalPlacementReviewEntry.createReview({
      eventId: input.eventId,
      scoringRevision: input.scoringRevision,
      placements: input.placements,
      ruleReference: input.ruleReference,
      statement: input.statement,
      officialName: input.officialName,
    });
    this.repository.append(review);
    return toDto(review, true, true);
  }

  async revoke(input: RevokeFinalPlacementReviewPayload): Promise<FinalPlacementReviewEntryDto> {
    const review = this.repository.findById(input.reviewId);
    if (!review) throw new Error(`Final placement review ${input.reviewId} was not found`);
    if (review.type !== 'REVIEW') throw new Error('A revocation entry cannot be revoked');
    const current = getCurrentFinalPlacementReview(this.repository.findByEventId(review.eventId));
    if (current?.id !== review.id) throw new Error(`Final placement review ${input.reviewId} is not active`);

    const revocation = FinalPlacementReviewEntry.createRevocation(review, {
      ruleReference: input.ruleReference,
      reason: input.reason,
      officialName: input.officialName,
    });
    this.repository.append(revocation);
    return toDto(revocation, false, false);
  }
}

function toDto(entry: FinalPlacementReviewEntry, active: boolean, current: boolean): FinalPlacementReviewEntryDto {
  return {
    id: entry.id,
    eventId: entry.eventId,
    type: entry.type,
    scoringRevision: entry.scoringRevision,
    placements: entry.placements.map((placement) => ({ ...placement })),
    ruleReference: entry.ruleReference,
    statement: entry.statement,
    officialName: entry.officialName,
    recordedAt: entry.recordedAt.toISOString(),
    reversesReviewId: entry.reversesReviewId,
    active,
    current,
  };
}
