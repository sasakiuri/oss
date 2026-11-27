// SPDX-License-Identifier: MIT
import {
  RangeOfficerRequestPayloadSchema,
  type RangeOfficerRequestPayload,
} from '@sasakiuri/saika-protocol/RangeOfficerRequest';
import { mqttTopics } from '@sasakiuri/saika-protocol/topics';

import type { RangeOfficerRequestService, RangeOfficerRequestState } from '@/main/modules/range-officer-request';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import type { IMqttClientService } from '../domain/IMqttClientService';

import { RetainedSignalPublisher } from './RetainedSignalPublisher';

/** Publishes the Lane-owned assistance signal without mutating competition control. */
export class RangeOfficerRequestPublisher extends RetainedSignalPublisher {
  constructor(mqttClient: IMqttClientService, storage: ILocalStorage, service: RangeOfficerRequestService) {
    super(mqttClient, storage, mqttTopics.laneRangeOfficerRequest, (laneId) =>
      RangeOfficerRequestPayloadSchema.parse(toRangeOfficerRequestPayload(laneId, service.getState())),
    );
  }
}

/** The retained payload and the IPC view of the current request; IPC returns it without schema parsing. */
export function toRangeOfficerRequestPayload(
  laneId: string,
  state: RangeOfficerRequestState | null,
  publishedAt = new Date(),
): RangeOfficerRequestPayload {
  return {
    schemaVersion: 1,
    laneId,
    status: state?.status ?? 'CLEARED',
    requestId: state?.requestId ?? null,
    category: state?.category ?? null,
    message: state?.message ?? null,
    requestedAt: state?.requestedAt.toISOString() ?? null,
    clearedAt: state?.clearedAt?.toISOString() ?? null,
    clearedBy: state?.clearedBy ?? null,
    publishedAt: publishedAt.toISOString(),
  };
}
