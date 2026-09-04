// SPDX-License-Identifier: MIT

import type { EstComplaintSignalContext } from './EstComplaintSignalState';

/** Captures trusted Lane state without accepting competition context from the Renderer. */
export interface IEstComplaintSignalContextSource {
  capture(): Promise<EstComplaintSignalContext>;
}
