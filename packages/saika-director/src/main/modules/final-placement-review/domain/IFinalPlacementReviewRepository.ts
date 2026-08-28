import type { FinalPlacementReviewEntry } from './FinalPlacementReviewEntry';

export interface IFinalPlacementReviewRepository {
  append(entry: FinalPlacementReviewEntry): void;
  findById(id: string): FinalPlacementReviewEntry | null;
  findByEventId(eventId: string): FinalPlacementReviewEntry[];
}
