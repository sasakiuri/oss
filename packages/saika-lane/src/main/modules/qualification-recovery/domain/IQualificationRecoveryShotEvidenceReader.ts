// SPDX-License-Identifier: MIT
import type { QualificationRecoveryShotPayload } from '@sasakiuri/saika-protocol/QualificationRecovery';

/** Read-only evidence boundary; adjudication does not depend on MQTT delivery state. */
export interface IQualificationRecoveryShotEvidenceReader {
  findByRunId(runId: string): QualificationRecoveryShotPayload[];
}
