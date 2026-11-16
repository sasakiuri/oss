// SPDX-License-Identifier: MIT

import {
  EstComplaintSignalPayloadSchema,
  type EstComplaintSignalPayload,
} from '@sasakiuri/saika-protocol/EstComplaintSignal';
import { mqttTopics } from '@sasakiuri/saika-protocol/topics';

import type { EstComplaintSignalService, EstComplaintSignalState } from '@/main/modules/est-complaint-signal';
import { readMirroredLaneId } from '@/main/modules/settings/application/MirroredLaneId';
import { SerialQueue } from '@/main/shared-infra/operations/SerialQueue';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import type { IMqttClientService } from '../domain/IMqttClientService';

/** Publishes Lane-owned EST complaint observations without issuing a competition-control command. */
export class EstComplaintSignalPublisher {
  private readonly publications = new SerialQueue();

  constructor(
    private readonly mqttClient: IMqttClientService,
    private readonly storage: ILocalStorage,
    private readonly service: EstComplaintSignalService,
  ) {}

  publishCurrentState(): Promise<void> {
    return this.publications.run(() => this.publishCurrentStateNow());
  }

  private async publishCurrentStateNow(): Promise<void> {
    if (!this.mqttClient.isConnected()) return;
    const laneId = readMirroredLaneId(this.storage);
    const payload = toEstComplaintSignalPayload(laneId, this.service.getState());
    await this.mqttClient.publish(mqttTopics.laneEstComplaintSignal(laneId), JSON.stringify(payload), {
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
