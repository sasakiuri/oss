// SPDX-License-Identifier: MIT

import type {
  QualificationMalfunctionSignalService,
  QualificationMalfunctionSignalState,
} from '@/main/modules/qualification-malfunction-signal';
import {
  QualificationMalfunctionSignalPayloadSchema,
  type QualificationMalfunctionSignalPayload,
} from '@/shared/mqtt/QualificationMalfunctionSignal';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import type { IMqttClientService } from '../infra/IMqttClientService';

/** Publishes the Lane-owned declaration without issuing a competition-control command. */
export class QualificationMalfunctionSignalPublisher {
  private publicationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly mqttClient: IMqttClientService,
    private readonly storage: ILocalStorage,
    private readonly service: QualificationMalfunctionSignalService,
  ) {}

  publishCurrentState(): Promise<void> {
    const publication = this.publicationQueue.then(() => this.publishCurrentStateNow());
    this.publicationQueue = publication.catch(() => undefined);
    return publication;
  }

  private async publishCurrentStateNow(): Promise<void> {
    if (!this.mqttClient.isConnected()) return;
    const laneId = this.storage.get<string>('mqtt.laneId') ?? '';
    const payload = toQualificationMalfunctionSignalPayload(laneId, this.service.getState());
    await this.mqttClient.publish(`saika/lane/${laneId}/qualification-malfunction/signal`, JSON.stringify(payload), {
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
