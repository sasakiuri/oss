// SPDX-License-Identifier: MIT

import type { EstComplaintSignalService, EstComplaintSignalState } from '@/main/modules/est-complaint-signal';
import { EstComplaintSignalPayloadSchema, type EstComplaintSignalPayload } from '@/shared/mqtt/EstComplaintSignal';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import type { IMqttClientService } from '../domain/IMqttClientService';

/** Publishes Lane-owned EST complaint observations without issuing a competition-control command. */
export class EstComplaintSignalPublisher {
  private publicationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly mqttClient: IMqttClientService,
    private readonly storage: ILocalStorage,
    private readonly service: EstComplaintSignalService,
  ) {}

  publishCurrentState(): Promise<void> {
    const publication = this.publicationQueue.then(() => this.publishCurrentStateNow());
    this.publicationQueue = publication.catch(() => undefined);
    return publication;
  }

  private async publishCurrentStateNow(): Promise<void> {
    if (!this.mqttClient.isConnected()) return;
    const laneId = this.storage.get<string>('mqtt.laneId') ?? '';
    const payload = toEstComplaintSignalPayload(laneId, this.service.getState());
    await this.mqttClient.publish(`saika/lane/${laneId}/est-complaint/signal`, JSON.stringify(payload), {
      qos: 1,
      retain: true,
    });
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
