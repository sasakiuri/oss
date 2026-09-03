// SPDX-License-Identifier: MIT
/**
 * Receives the Director-owned retained competition state and ensures that the
 * lane has a local aggregate with the same competition ID before join is ACKed.
 */

import { StartCompetitionToken } from '@/main/composition/tokens';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import {
  CompetitionDefinitionCompatibilityPolicy,
  type LocalCompetitionDefinitionIdentity,
} from '@/main/modules/mqtt/domain/CompetitionDefinitionCompatibilityPolicy';
import {
  CompetitionStatePayloadSchema,
  type CompetitionStatePayload,
} from '@/main/modules/mqtt/domain/MqttCompetitionStateSchemas';
import type { IMqttClientService } from '@/main/modules/mqtt/infra/IMqttClientService';
import type { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

const DEFAULT_STATE_TIMEOUT_MS = 5_000;

export class CompetitionStateSubscriber {
  private subscribedTopic: string | null = null;
  private messageUnsubscribe: (() => void) | null = null;
  private lastPhase: string | null = null;

  constructor(
    private readonly mqttClient: IMqttClientService,
    private readonly commandBus: CommandBus,
    private readonly competitionRepository: ICompetitionRepository,
    private readonly stateTimeoutMs: number = DEFAULT_STATE_TIMEOUT_MS,
    private readonly definitionResolver: (
      competitionTypeId: string,
    ) => LocalCompetitionDefinitionIdentity | undefined = () => undefined,
    private readonly compatibilityPolicy = new CompetitionDefinitionCompatibilityPolicy(),
  ) {}

  async subscribe(competitionId: string): Promise<CompetitionStatePayload> {
    await this.unsubscribe();

    const topic = `saika/competition/${competitionId}/state`;
    this.subscribedTopic = topic;
    this.lastPhase = null;

    let resolveFirstState: (state: CompetitionStatePayload) => void = () => undefined;
    const firstState = new Promise<CompetitionStatePayload>((resolve) => {
      resolveFirstState = resolve;
    });
    let firstStateReceived = false;

    // Register before SUBSCRIBE because a retained message can arrive before
    // subscribe() resolves.
    this.messageUnsubscribe = this.mqttClient.onMessage((msgTopic: string, payload: Buffer) => {
      if (msgTopic !== topic) return;
      const state = this.parseMessage(payload);
      if (!state || state.competitionId !== competitionId) return;

      this.logPhaseChange(state);
      if (!firstStateReceived) {
        firstStateReceived = true;
        resolveFirstState(state);
      }
    });

    try {
      await this.mqttClient.subscribe(topic, 1);
      const state = await this.withTimeout(firstState, competitionId);
      await this.ensureLocalCompetition(state);
      getLogger().info(`[CompetitionStateSubscriber] Subscribed to ${topic}`, 'mqtt');
      return state;
    } catch (error) {
      await this.unsubscribe();
      throw error;
    }
  }

  async unsubscribe(): Promise<void> {
    this.messageUnsubscribe?.();
    this.messageUnsubscribe = null;

    if (this.subscribedTopic) {
      try {
        await this.mqttClient.unsubscribe(this.subscribedTopic);
      } catch {
        // Ignore if already disconnected.
      }
      this.subscribedTopic = null;
      this.lastPhase = null;
    }
  }

  private parseMessage(payload: Buffer): CompetitionStatePayload | null {
    const logger = getLogger();
    let rawData: unknown;
    try {
      rawData = JSON.parse(payload.toString());
    } catch {
      logger.error('[CompetitionStateSubscriber] Failed to parse JSON', 'mqtt');
      return null;
    }

    const result = CompetitionStatePayloadSchema.safeParse(rawData);
    if (!result.success) {
      logger.warn('[CompetitionStateSubscriber] Invalid payload', 'mqtt', {
        error: result.error.message,
      });
      return null;
    }
    return result.data;
  }

  private logPhaseChange(state: CompetitionStatePayload): void {
    if (state.phase === this.lastPhase) return;
    getLogger().info(
      `[CompetitionStateSubscriber] Phase changed: ${this.lastPhase ?? '(none)'} → ${state.phase}`,
      'mqtt',
      {
        competitionId: state.competitionId,
        competitionTypeId: state.competitionTypeId,
        phase: state.phase,
      },
    );
    this.lastPhase = state.phase;
  }

  private async ensureLocalCompetition(state: CompetitionStatePayload): Promise<void> {
    const compatibility = this.compatibilityPolicy.assess(state, this.definitionResolver(state.competitionTypeId));
    if (!compatibility.joinAllowed) {
      throw ErrorCatalog.createError('MQTT_COMPETITION_STATE_MISMATCH', {
        detail: compatibility.guidance,
      });
    }
    if (compatibility.status !== 'MATCH' && compatibility.status !== 'DISABLED') {
      getLogger().warn('[CompetitionStateSubscriber] Rule Pack compatibility is not exact', 'mqtt', {
        competitionId: state.competitionId,
        status: compatibility.status,
        guidance: compatibility.guidance,
      });
    }

    const existing = await this.competitionRepository.findById(state.competitionId);
    if (existing) {
      const totalSeries = existing.config.stages
        .filter((stage) => stage.scored)
        .flatMap((stage) => stage.series)
        .filter((series) => series.maxShots > 0 && series.purpose !== 'POSITION_CHANGE_AND_SIGHTING').length;
      const totalShots = existing.config.stages
        .filter((stage) => stage.scored)
        .flatMap((stage) => stage.series)
        .reduce((sum, series) => sum + series.maxShots, 0);
      const matches =
        existing.config.name === state.roundName &&
        existing.config.acc === state.acc &&
        existing.config.shotsPerSeries === state.shotsPerSeries &&
        totalSeries === state.totalSeries &&
        totalShots === state.totalShots;
      if (!matches) {
        throw ErrorCatalog.createError('MQTT_COMPETITION_STATE_MISMATCH', {
          detail: state.competitionId,
        });
      }

      // The Lane may have durably applied finish-competition while Director
      // still retains an earlier phase because its ACK or retained-state write
      // was interrupted. Keep the saved membership and subscriptions so a new
      // finish command can republish the final snapshots and complete cleanup.
      return;
    }

    if (state.phase !== 'NOT_STARTED') {
      throw ErrorCatalog.createError('MQTT_COMPETITION_STATE_MISMATCH', {
        detail: `${state.competitionId} is already ${state.phase}`,
      });
    }

    await this.commandBus.execute(StartCompetitionToken, {
      competitionId: state.competitionId,
      competitionTypeId: state.competitionTypeId,
    });
  }

  private async withTimeout(
    statePromise: Promise<CompetitionStatePayload>,
    competitionId: string,
  ): Promise<CompetitionStatePayload> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(
          ErrorCatalog.createError('MQTT_COMPETITION_STATE_TIMEOUT', {
            competitionId,
          }),
        );
      }, this.stateTimeoutMs);
    });

    try {
      return await Promise.race([statePromise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
