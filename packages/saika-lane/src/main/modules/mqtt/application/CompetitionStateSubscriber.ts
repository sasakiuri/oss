// SPDX-License-Identifier: MIT
/**
 * Receives the Director-owned retained competition state and ensures that the
 * lane has a local aggregate with the same competition ID before join is ACKed.
 */

import {
  CompetitionStatePayloadSchema,
  type CompetitionStatePayload,
} from '@sasakiuri/saika-protocol/CompetitionState';
import { mqttTopics } from '@sasakiuri/saika-protocol/topics';

import { StartCompetitionToken } from '@/main/composition/tokens';
import { isRecordedMatchSeries } from '@/main/modules/competition/domain/CompetitionShotModePolicy';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import { TopicSubscription } from '@/main/modules/mqtt/application/TopicSubscription';
import {
  CompetitionDefinitionCompatibilityPolicy,
  type LocalCompetitionDefinitionIdentity,
} from '@/main/modules/mqtt/domain/CompetitionDefinitionCompatibilityPolicy';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import type { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import { errorMessage } from '@/shared/errors/errorMessage';

const DEFAULT_STATE_TIMEOUT_MS = 5_000;

export class CompetitionStateSubscriber {
  private readonly subscription: TopicSubscription;
  private lastPhase: string | null = null;

  constructor(
    mqttClient: IMqttClientService,
    private readonly commandBus: CommandBus,
    private readonly competitionRepository: ICompetitionRepository,
    private readonly stateTimeoutMs: number = DEFAULT_STATE_TIMEOUT_MS,
    private readonly definitionResolver: (
      competitionTypeId: string,
    ) => LocalCompetitionDefinitionIdentity | undefined = () => undefined,
    private readonly compatibilityPolicy = new CompetitionDefinitionCompatibilityPolicy(),
  ) {
    // Register before SUBSCRIBE because a retained message can arrive before subscribe() resolves.
    this.subscription = new TopicSubscription(mqttClient, {
      listenBeforeSubscribe: true,
      unsubscribeErrors: 'rethrow-while-connected',
    });
  }

  async subscribe(competitionId: string): Promise<CompetitionStatePayload> {
    await this.unsubscribe();

    const topic = mqttTopics.competitionState(competitionId);
    this.lastPhase = null;

    let resolveFirstState: (state: CompetitionStatePayload) => void = () => undefined;
    const firstState = new Promise<CompetitionStatePayload>((resolve) => {
      resolveFirstState = resolve;
    });
    let firstStateReceived = false;

    const onMessage = (msgTopic: string, payload: Buffer): void => {
      if (msgTopic !== topic) return;
      const state = this.parseMessage(payload);
      if (!state || state.competitionId !== competitionId) return;

      this.logPhaseChange(state);
      if (!firstStateReceived) {
        firstStateReceived = true;
        resolveFirstState(state);
      }
    };

    try {
      await this.subscription.open(topic, onMessage);
      const state = await this.withTimeout(firstState, competitionId);
      await this.ensureLocalCompetition(state);
      getLogger().info(`[CompetitionStateSubscriber] Subscribed to ${topic}`, 'mqtt');
      return state;
    } catch (error) {
      try {
        await this.unsubscribe();
      } catch (cleanupError) {
        getLogger().warn('[CompetitionStateSubscriber] Failed to clean up competition subscription', 'mqtt', {
          competitionId,
          error: errorMessage(cleanupError),
        });
      }
      throw error;
    }
  }

  async unsubscribe(): Promise<void> {
    await this.subscription.close();
    this.lastPhase = null;
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
      const active = await this.competitionRepository.findActive();
      if (
        state.phase !== 'NOT_STARTED' &&
        active?.id !== state.competitionId &&
        !(existing.phase === 'FINISHED' && !active)
      ) {
        throw ErrorCatalog.createError('MQTT_COMPETITION_STATE_MISMATCH', {
          detail: 'A different local competition is active',
        });
      }
      const totalSeries = existing.config.stages.flatMap((stage) =>
        stage.series.filter((series) => isRecordedMatchSeries(stage, series)),
      ).length;
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
