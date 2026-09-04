// SPDX-License-Identifier: MIT

import {
  EstComplaintSignalState,
  type EstComplaintIssue,
  type EstComplaintSignalContext,
} from '../domain/EstComplaintSignalState';
import type { IEstComplaintSignalRepository } from '../domain/IEstComplaintSignalRepository';

export class EstComplaintSignalService {
  private state: EstComplaintSignalState | null;

  constructor(private readonly repository: IEstComplaintSignalRepository) {
    this.state = repository.getCurrent();
  }

  getState(): EstComplaintSignalState | null {
    return this.state;
  }

  signal(input: {
    issue: EstComplaintIssue;
    context: EstComplaintSignalContext;
    message?: string | null;
  }): EstComplaintSignalState {
    if (this.state?.status === 'ACTIVE') {
      throw new Error(`EST complaint signal ${this.state.signalId} is already active`);
    }
    const state = EstComplaintSignalState.signal(input);
    this.repository.appendSignalled(state);
    this.state = state;
    return state;
  }

  clear(input: { signalId: string; clearedBy: string }): EstComplaintSignalState {
    if (!this.state || this.state.status !== 'ACTIVE') throw new Error('No active EST complaint signal to clear');
    if (this.state.signalId !== input.signalId) {
      throw new Error(`Signal ${input.signalId} does not match active signal ${this.state.signalId}`);
    }
    const state = this.state.clear(input.clearedBy);
    this.repository.appendCleared(state);
    this.state = state;
    return state;
  }
}
