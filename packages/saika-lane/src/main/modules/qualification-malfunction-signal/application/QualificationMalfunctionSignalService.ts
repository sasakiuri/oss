// SPDX-License-Identifier: MIT

import type { IQualificationMalfunctionSignalRepository } from '../domain/IQualificationMalfunctionSignalRepository';
import {
  QualificationMalfunctionSignalState,
  type QualificationMalfunctionSignalContext,
} from '../domain/QualificationMalfunctionSignalState';

export class QualificationMalfunctionSignalService {
  private state: QualificationMalfunctionSignalState | null;

  constructor(private readonly repository: IQualificationMalfunctionSignalRepository) {
    this.state = repository.getCurrent();
  }

  getState(): QualificationMalfunctionSignalState | null {
    return this.state;
  }

  signal(input: {
    context: QualificationMalfunctionSignalContext;
    message?: string | null;
  }): QualificationMalfunctionSignalState {
    if (this.state?.status === 'ACTIVE') {
      throw new Error(`Qualification malfunction signal ${this.state.signalId} is already active`);
    }
    const state = QualificationMalfunctionSignalState.signal(input);
    this.repository.appendSignalled(state);
    this.state = state;
    return state;
  }

  clear(input: { signalId: string; clearedBy: string }): QualificationMalfunctionSignalState {
    if (!this.state || this.state.status !== 'ACTIVE') {
      throw new Error('No active qualification malfunction signal to clear');
    }
    if (this.state.signalId !== input.signalId) {
      throw new Error(`Signal ${input.signalId} does not match active signal ${this.state.signalId}`);
    }
    const state = this.state.clear(input.clearedBy);
    this.repository.appendCleared(state);
    this.state = state;
    return state;
  }
}
