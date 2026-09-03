import type { IRangeOfficerRequestRepository } from '../domain/IRangeOfficerRequestRepository';
import { RangeOfficerRequestState, type RangeOfficerRequestCategory } from '../domain/RangeOfficerRequestState';

export class RangeOfficerRequestService {
  private state: RangeOfficerRequestState | null;

  constructor(private readonly repository: IRangeOfficerRequestRepository) {
    this.state = repository.getCurrent();
  }

  getState(): RangeOfficerRequestState | null {
    return this.state;
  }

  request(input: { category: RangeOfficerRequestCategory; message?: string | null }): RangeOfficerRequestState {
    if (this.state?.status === 'ACTIVE') {
      throw new Error(`Range Officer request ${this.state.requestId} is already active`);
    }
    const state = RangeOfficerRequestState.request(input);
    this.repository.appendRequested(state);
    this.state = state;
    return state;
  }

  clear(input: { requestId: string; clearedBy: string }): RangeOfficerRequestState {
    if (!this.state || this.state.status !== 'ACTIVE') throw new Error('No active Range Officer request to clear');
    if (this.state.requestId !== input.requestId) {
      throw new Error(`Request ${input.requestId} does not match active request ${this.state.requestId}`);
    }
    const state = this.state.clear(input.clearedBy);
    this.repository.appendCleared(state);
    this.state = state;
    return state;
  }
}
