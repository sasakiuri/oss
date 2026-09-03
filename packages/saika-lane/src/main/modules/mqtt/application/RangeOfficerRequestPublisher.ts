// SPDX-License-Identifier: MIT
import type { RangeOfficerRequestService } from '@/main/modules/range-officer-request';
import { RangeOfficerRequestPayloadSchema } from '@/shared/mqtt/RangeOfficerRequest';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import type { IMqttClientService } from '../infra/IMqttClientService';

/** Publishes the Lane-owned assistance signal without mutating competition control. */
export class RangeOfficerRequestPublisher {
  private publicationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly mqttClient: IMqttClientService,
    private readonly storage: ILocalStorage,
    private readonly service: RangeOfficerRequestService,
  ) {}

  publishCurrentState(): Promise<void> {
    const publication = this.publicationQueue.then(() => this.publishCurrentStateNow());
    this.publicationQueue = publication.catch(() => undefined);
    return publication;
  }

  private async publishCurrentStateNow(): Promise<void> {
    if (!this.mqttClient.isConnected()) return;
    const laneId = this.storage.get<string>('mqtt.laneId') ?? '';
    const state = this.service.getState();
    const payload = RangeOfficerRequestPayloadSchema.parse({
      schemaVersion: 1,
      laneId,
      status: state?.status ?? 'CLEARED',
      requestId: state?.requestId ?? null,
      category: state?.category ?? null,
      message: state?.message ?? null,
      requestedAt: state?.requestedAt.toISOString() ?? null,
      clearedAt: state?.clearedAt?.toISOString() ?? null,
      clearedBy: state?.clearedBy ?? null,
      publishedAt: new Date().toISOString(),
    });
    await this.mqttClient.publish(`saika/lane/${laneId}/range-officer/request`, JSON.stringify(payload), {
      qos: 1,
      retain: true,
    });
  }
}
