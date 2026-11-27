// SPDX-License-Identifier: MIT

import {
  QualificationMalfunctionSignalPayloadSchema,
  type QualificationMalfunctionSignalPayload,
} from '@sasakiuri/saika-protocol/QualificationMalfunctionSignal';
import { mqttTopics } from '@sasakiuri/saika-protocol/topics';

import type {
  QualificationMalfunctionSignalService,
  QualificationMalfunctionSignalState,
} from '@/main/modules/qualification-malfunction-signal';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import type { IMqttClientService } from '../domain/IMqttClientService';

import { RetainedSignalPublisher } from './RetainedSignalPublisher';

/** Publishes the Lane-owned declaration without issuing a competition-control command. */
export class QualificationMalfunctionSignalPublisher extends RetainedSignalPublisher {
  constructor(mqttClient: IMqttClientService, storage: ILocalStorage, service: QualificationMalfunctionSignalService) {
    super(mqttClient, storage, mqttTopics.laneQualificationMalfunctionSignal, (laneId) =>
      toQualificationMalfunctionSignalPayload(laneId, service.getState()),
    );
  }
}

export function toQualificationMalfunctionSignalPayload(
  laneId: string,
  state: QualificationMalfunctionSignalState | null,
  publishedAt = new Date(),
): QualificationMalfunctionSignalPayload {
  return QualificationMalfunctionSignalPayloadSchema.parse({
    schemaVersion: 1,
    laneId,
    status: state?.status ?? 'CLEARED',
    signalId: state?.signalId ?? null,
    context: state?.context ?? null,
    message: state?.message ?? null,
    signalledAt: state?.signalledAt.toISOString() ?? null,
    clearedAt: state?.clearedAt?.toISOString() ?? null,
    clearedBy: state?.clearedBy ?? null,
    publishedAt: publishedAt.toISOString(),
  });
}
