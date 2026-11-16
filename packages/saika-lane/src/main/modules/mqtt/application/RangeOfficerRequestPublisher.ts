// SPDX-License-Identifier: MIT
import {
  RangeOfficerRequestPayloadSchema,
  type RangeOfficerRequestPayload,
} from '@sasakiuri/saika-protocol/RangeOfficerRequest';
import { mqttTopics } from '@sasakiuri/saika-protocol/topics';

import type { RangeOfficerRequestService, RangeOfficerRequestState } from '@/main/modules/range-officer-request';
import { readMirroredLaneId } from '@/main/modules/settings/application/MirroredLaneId';
import { SerialQueue } from '@/main/shared-infra/operations/SerialQueue';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import type { IMqttClientService } from '../domain/IMqttClientService';

/** Publishes the Lane-owned assistance signal without mutating competition control. */
export class RangeOfficerRequestPublisher {
  private readonly publications = new SerialQueue();

  constructor(
    private readonly mqttClient: IMqttClientService,
    private readonly storage: ILocalStorage,
    private readonly service: RangeOfficerRequestService,
  ) {}

  publishCurrentState(): Promise<void> {
    return this.publications.run(() => this.publishCurrentStateNow());
  }

  private async publishCurrentStateNow(): Promise<void> {
    if (!this.mqttClient.isConnected()) return;
    const laneId = readMirroredLaneId(this.storage);
    const payload = RangeOfficerRequestPayloadSchema.parse(
      toRangeOfficerRequestPayload(laneId, this.service.getState()),
    );
    await this.mqttClient.publish(mqttTopics.laneRangeOfficerRequest(laneId), JSON.stringify(payload), {
      qos: 1,
      retain: true,
    });
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
