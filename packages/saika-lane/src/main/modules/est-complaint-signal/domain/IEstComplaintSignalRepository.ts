// SPDX-License-Identifier: MIT

import type { EstComplaintSignalState } from './EstComplaintSignalState';

export interface IEstComplaintSignalRepository {
  getCurrent(): EstComplaintSignalState | null;
  appendSignalled(state: EstComplaintSignalState): void;
  appendCleared(state: EstComplaintSignalState): void;
}
