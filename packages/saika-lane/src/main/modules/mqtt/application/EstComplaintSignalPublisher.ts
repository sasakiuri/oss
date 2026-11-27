// SPDX-License-Identifier: MIT

import {
  EstComplaintSignalPayloadSchema,
  type EstComplaintSignalPayload,
} from '@sasakiuri/saika-protocol/EstComplaintSignal';
import { mqttTopics } from '@sasakiuri/saika-protocol/topics';

import type { EstComplaintSignalService, EstComplaintSignalState } from '@/main/modules/est-complaint-signal';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import type { IMqttClientService } from '../domain/IMqttClientService';

import { RetainedSignalPublisher } from './RetainedSignalPublisher';

/** Publishes Lane-owned EST complaint observations without issuing a competition-control command. */
export class EstComplaintSignalPublisher extends RetainedSignalPublisher {
  constructor(mqttClient: IMqttClientService, storage: ILocalStorage, service: EstComplaintSignalService) {
    super(mqttClient, storage, mqttTopics.laneEstComplaintSignal, (laneId) =>
      toEstComplaintSignalPayload(laneId, service.getState()),
    );
  }
}

export function toEstComplaintSignalPayload(
  laneId: string,
  state: EstComplaintSignalState | null,
  publishedAt = new Date(),
): EstComplaintSignalPayload {
  return EstComplaintSignalPayloadSchema.parse({
    schemaVersion: 1,
    laneId,
    status: state?.status ?? 'CLEARED',
    signalId: state?.signalId ?? null,
    issue: state?.issue ?? null,
    context: state?.context ?? null,
    message: state?.message ?? null,
    signalledAt: state?.signalledAt.toISOString() ?? null,
    clearedAt: state?.clearedAt?.toISOString() ?? null,
    clearedBy: state?.clearedBy ?? null,
    publishedAt: publishedAt.toISOString(),
  });
}
