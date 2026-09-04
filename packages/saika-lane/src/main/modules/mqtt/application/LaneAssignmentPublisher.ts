// SPDX-License-Identifier: MIT
/** Publishes and persists the lane's retained athlete assignment. */

import type { Athlete, LaneAssignmentPayload } from '@/main/modules/mqtt/domain/MqttAssignmentSchemas';
import { LaneAssignmentPayloadSchema } from '@/main/modules/mqtt/domain/MqttAssignmentSchemas';
import type { IMqttClientService } from '@/main/modules/mqtt/infra/IMqttClientService';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

const ASSIGNMENT_STORAGE_KEY = 'mqtt.assignment';

export interface LaneAssignmentSnapshot {
  competitionId: string;
  athlete: Athlete | null;
  assignedAt: string | null;
}

export class LaneAssignmentPublisher {
  constructor(
    private readonly mqttClient: IMqttClientService,
    private readonly storage: ILocalStorage,
    private readonly getLaneId: () => string,
  ) {}

  async assign(competitionId: string, athlete: Athlete | null): Promise<LaneAssignmentPayload> {
    const stored: LaneAssignmentSnapshot = {
      competitionId,
      athlete,
      assignedAt: athlete ? new Date().toISOString() : null,
    };
    this.storage.set(ASSIGNMENT_STORAGE_KEY, stored);
    return this.publish(stored);
  }

  async publishCurrentAssignment(competitionId: string): Promise<void> {
    const stored = this.storage.get<LaneAssignmentSnapshot>(ASSIGNMENT_STORAGE_KEY);
    if (!stored || stored.competitionId !== competitionId) return;
    await this.publish(stored);
  }

  clearStoredAssignment(competitionId: string): void {
    const stored = this.storage.get<LaneAssignmentSnapshot>(ASSIGNMENT_STORAGE_KEY);
    if (stored?.competitionId === competitionId) {
      this.storage.delete(ASSIGNMENT_STORAGE_KEY);
    }
  }

  getCurrentAssignment(competitionId?: string): LaneAssignmentSnapshot | null {
    const stored = this.storage.get<LaneAssignmentSnapshot>(ASSIGNMENT_STORAGE_KEY);
    if (!stored || (competitionId && stored.competitionId !== competitionId)) return null;
    return {
      competitionId: stored.competitionId,
      athlete: stored.athlete ? { ...stored.athlete } : null,
      assignedAt: stored.assignedAt,
    };
  }

  private async publish(stored: LaneAssignmentSnapshot): Promise<LaneAssignmentPayload> {
    const laneId = this.getLaneId();
    const payload = LaneAssignmentPayloadSchema.parse({
      competitionId: stored.competitionId,
      laneId,
      athlete: stored.athlete,
      assignedAt: stored.assignedAt,
      publishedAt: new Date().toISOString(),
    });
    const topic = `saika/competition/${stored.competitionId}/lane/${laneId}/assignment`;
    await this.mqttClient.publish(topic, JSON.stringify(payload), { qos: 1, retain: true });
    return payload;
  }
}
