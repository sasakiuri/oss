import type { RangeOfficerRequestState } from './RangeOfficerRequestState';

export interface IRangeOfficerRequestRepository {
  getCurrent(): RangeOfficerRequestState | null;
  appendRequested(state: RangeOfficerRequestState): void;
  appendCleared(state: RangeOfficerRequestState): void;
}
