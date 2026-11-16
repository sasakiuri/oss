// SPDX-License-Identifier: MIT
import { CompetitionCuePayloadSchema, type CompetitionCuePayload } from '@sasakiuri/saika-protocol/CompetitionCue';
import { mqttTopics } from '@sasakiuri/saika-protocol/topics';

import { TopicSubscription } from '@/main/modules/mqtt/application/TopicSubscription';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';

/** Projects a retained Director cue to Lane's local event bus without mutating competition state. */
export class CompetitionCueSubscriber {
  private readonly subscription: TopicSubscription;
  private competitionId: string | null = null;

  constructor(
    mqttClient: IMqttClientService,
    private readonly eventBus: IEventBus,
    private readonly getLaneId: () => string,
  ) {
    this.subscription = new TopicSubscription(mqttClient, {
      listenBeforeSubscribe: true,
      unsubscribeErrors: 'rethrow-while-connected',
    });
  }

  async subscribe(competitionId: string): Promise<void> {
    await this.unsubscribe();
    const topic = mqttTopics.competitionCue(competitionId);
    this.competitionId = competitionId;
    await this.subscription.open(topic, (messageTopic, payload) => {
      if (messageTopic !== topic) return;
      this.handleMessage(competitionId, payload);
    });
  }

  async unsubscribe(): Promise<void> {
    const competitionId = this.competitionId;
    await this.subscription.close();
    this.competitionId = null;
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
