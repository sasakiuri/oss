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
import { readMirroredLaneId } from '@/main/modules/settings/application/MirroredLaneId';
import { SerialQueue } from '@/main/shared-infra/operations/SerialQueue';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import type { IMqttClientService } from '../domain/IMqttClientService';

/** Publishes the Lane-owned declaration without issuing a competition-control command. */
export class QualificationMalfunctionSignalPublisher {
  private readonly publications = new SerialQueue();

  constructor(
    private readonly mqttClient: IMqttClientService,
    private readonly storage: ILocalStorage,
    private readonly service: QualificationMalfunctionSignalService,
  ) {}

  publishCurrentState(): Promise<void> {
    return this.publications.run(() => this.publishCurrentStateNow());
  }

  private async publishCurrentStateNow(): Promise<void> {
    if (!this.mqttClient.isConnected()) return;
    const laneId = readMirroredLaneId(this.storage);
    const payload = toQualificationMalfunctionSignalPayload(laneId, this.service.getState());
    await this.mqttClient.publish(mqttTopics.laneQualificationMalfunctionSignal(laneId), JSON.stringify(payload), {
      qos: 1,
      retain: true,
    });
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
