// SPDX-License-Identifier: MIT
import {
  CompetitionCuePayloadSchema,
  type CompetitionCuePayload,
} from '@/main/modules/mqtt/domain/MqttCompetitionCueSchemas';
import type { IMqttClientService } from '@/main/modules/mqtt/infra/IMqttClientService';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';

/** Projects a retained Director cue to Lane's local event bus without mutating competition state. */
export class CompetitionCueSubscriber {
  private subscribedTopic: string | null = null;
  private messageUnsubscribe: (() => void) | null = null;
  private competitionId: string | null = null;

  constructor(
    private readonly mqttClient: IMqttClientService,
    private readonly eventBus: IEventBus,
    private readonly getLaneId: () => string,
  ) {}

  async subscribe(competitionId: string): Promise<void> {
    await this.unsubscribe();
    const topic = `saika/competition/${competitionId}/cue`;
    this.subscribedTopic = topic;
    this.competitionId = competitionId;
    this.messageUnsubscribe = this.mqttClient.onMessage((messageTopic, payload) => {
      if (messageTopic !== topic) return;
      this.handleMessage(competitionId, payload);
    });
    await this.mqttClient.subscribe(topic, 1);
  }

  async unsubscribe(): Promise<void> {
    this.messageUnsubscribe?.();
    this.messageUnsubscribe = null;
    const topic = this.subscribedTopic;
    const competitionId = this.competitionId;
    this.subscribedTopic = null;
    this.competitionId = null;
    if (topic) {
      try {
        await this.mqttClient.unsubscribe(topic);
      } catch {
        // Ignore if already disconnected.
      }
    }
    if (competitionId) this.emit(competitionId, null);
  }

  private handleMessage(competitionId: string, payload: Buffer): void {
    if (payload.length === 0) {
      this.emit(competitionId, null);
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(payload.toString());
    } catch {
      getLogger().warn('[CompetitionCueSubscriber] Invalid JSON payload', 'mqtt');
      return;
    }
    const parsed = CompetitionCuePayloadSchema.safeParse(raw);
    if (!parsed.success || parsed.data.competitionId !== competitionId) {
      getLogger().warn('[CompetitionCueSubscriber] Invalid cue payload', 'mqtt', {
        error: parsed.success ? 'competition ID mismatch' : parsed.error.message,
      });
      return;
    }
    const cue = parsed.data;
    const targeted = !cue.targetLaneIds || cue.targetLaneIds.includes(this.getLaneId());
    this.emit(competitionId, targeted ? cue : null);
  }

  private emit(competitionId: string, cue: CompetitionCuePayload | null): void {
    this.eventBus.emit({
      type: 'CompetitionCueChanged',
      timestamp: Date.now(),
      aggregateId: competitionId,
      cue,
    });
  }
}
