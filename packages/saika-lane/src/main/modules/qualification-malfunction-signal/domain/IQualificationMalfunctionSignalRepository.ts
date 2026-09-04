// SPDX-License-Identifier: MIT

import type { QualificationMalfunctionSignalState } from './QualificationMalfunctionSignalState';

export interface IQualificationMalfunctionSignalRepository {
  getCurrent(): QualificationMalfunctionSignalState | null;
  appendSignalled(state: QualificationMalfunctionSignalState): void;
  appendCleared(state: QualificationMalfunctionSignalState): void;
}
