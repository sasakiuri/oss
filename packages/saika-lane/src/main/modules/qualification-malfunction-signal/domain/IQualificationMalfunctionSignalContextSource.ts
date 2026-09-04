// SPDX-License-Identifier: MIT

import type { QualificationMalfunctionSignalContext } from './QualificationMalfunctionSignalState';

/** Captures trusted Lane state without accepting competition context from the Renderer. */
export interface IQualificationMalfunctionSignalContextSource {
  capture(): Promise<QualificationMalfunctionSignalContext>;
}
