// SPDX-License-Identifier: MIT
/** Handles competition membership and starts competition subscriptions after joining. */

import { commandSchemasForScope, type MqttCommandActionOf } from '@sasakiuri/saika-protocol/commands';
import { mqttTopicFilters, mqttTopics, parseMqttTopic, type ParsedMqttTopicOf } from '@sasakiuri/saika-protocol/topics';

import type { ICompetitionShootOffControl } from '@/main/modules/competition-shoot-off';
import type { CompetitionCueSubscriber } from '@/main/modules/mqtt/application/CompetitionCueSubscriber';
import type { CompetitionStateSubscriber } from '@/main/modules/mqtt/application/CompetitionStateSubscriber';
import type { DirectorMembership } from '@/main/modules/mqtt/application/DirectorMembership';
import type { LaneSafetyStatePublisher } from '@/main/modules/mqtt/application/LaneSafetyStatePublisher';
import type { RetainPublisher } from '@/main/modules/mqtt/application/RetainPublisher';
import type { RpcRequestHandler } from '@/main/modules/mqtt/application/RpcRequestHandler';
import { TopicSubscription } from '@/main/modules/mqtt/application/TopicSubscription';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import { laneCommandSchemas } from '@/main/modules/mqtt/domain/MqttCommandSchemas';
import type { ILaneSafetyStopControl } from '@/main/modules/safety-stop';
import type { ITimedTargetControl } from '@/main/modules/timed-target';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

import type { BroadcastCommandHandler } from './BroadcastCommandHandler';
import type { LaneCommandProcessor, LaneCommandSchemas } from './LaneCommandProcessor';
import type { PerLaneCommandHandler } from './PerLaneCommandHandler';

type Tier1Action = MqttCommandActionOf<'lane'>;

const ACTION_SCHEMAS: LaneCommandSchemas<Tier1Action> = commandSchemasForScope(laneCommandSchemas, 'lane');

type Tier1Topic = ParsedMqttTopicOf<'laneCommand'>;

export interface LaneTier1CommandHandlerDeps {
  mqttClient: IMqttClientService;
  processor: LaneCommandProcessor;
  broadcastHandler: Pick<BroadcastCommandHandler, 'subscribeToCompetition' | 'unsubscribeFromCompetition'>;
  perLaneHandler: Pick<PerLaneCommandHandler, 'subscribeToCompetition' | 'unsubscribeFromCompetition'>;
  rpcHandler: Pick<RpcRequestHandler, 'subscribe' | 'unsubscribe'>;
  competitionStateSubscriber: Pick<CompetitionStateSubscriber, 'subscribe' | 'unsubscribe'>;
  competitionCueSubscriber: Pick<CompetitionCueSubscriber, 'subscribe' | 'unsubscribe'>;
  retainPublisher: Pick<RetainPublisher, 'clearCompetitionTopics'>;
  membership: DirectorMembership;
  getLaneId: () => string;
  safetyStopControl: ILaneSafetyStopControl;
  safetyStatePublisher: Pick<LaneSafetyStatePublisher, 'publishCurrentState'>;
  competitionShootOffControl: ICompetitionShootOffControl;
  timedTargetControl: ITimedTargetControl;
}

export class LaneTier1CommandHandler {
  private readonly subscription: TopicSubscription;

  constructor(private readonly deps: LaneTier1CommandHandlerDeps) {
    this.subscription = new TopicSubscription(deps.mqttClient, {
      listenBeforeSubscribe: true,
      unsubscribeErrors: 'ignore',
    });
  }

  /**
   * Subscribes to Tier1 commands
   */
  async subscribe(): Promise<void> {
    await this.unsubscribeTier1Topic();

    await this.subscription.open(mqttTopicFilters.laneCommands(this.deps.getLaneId()), (msgTopic, payload) => {
      const parsed = parseMqttTopic(msgTopic);
      if (parsed?.kind !== 'laneCommand') return;
      if (parsed.laneId !== this.deps.getLaneId()) return;

      void this.handleCommand(parsed, payload);
    });

    const savedCompetitionId = this.competitionId;
    if (savedCompetitionId) {
      try {
        await this.activateCompetitionSubscriptions(savedCompetitionId);
      } catch (error) {
        await this.deactivateCompetitionSubscriptions();
        this.deps.membership.setCompetitionId(null);
        getLogger().warn('[LaneTier1CommandHandler] Failed to restore competition membership', 'mqtt', {
          competitionId: savedCompetitionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Unsubscribes
   */
  async unsubscribe(): Promise<void> {
    if (this.competitionId) {
      await this.deactivateCompetitionSubscriptions();
    }
    await this.unsubscribeTier1Topic();
  }

  private async unsubscribeTier1Topic(): Promise<void> {
    await this.subscription.close();
  }

  /**
   * Returns the competition ID currently joined
   */
  get competitionId(): string | null {
    return this.deps.membership.snapshot.competitionId;
  }

  /**
   * Processes a command
   */
  private handleCommand(parsed: Tier1Topic, payload: Buffer): Promise<void> {
    return this.deps.processor.handle<Tier1Action>({
      logContext: 'LaneTier1CommandHandler',
      action: parsed.action,
      payload,
      schemas: ACTION_SCHEMAS,
      requiresReady: (action) => action === 'join-competition',
      acknowledgementTopic: mqttTopics.laneCommandAcknowledgement(this.deps.getLaneId(), parsed.action),
      execute: (action, command, receivedAt) => this.executeAction(action, command, receivedAt),
    });
  }

  /**
   * Executes an action
   */
  private async executeAction(
    action: Tier1Action,
    command: Record<string, unknown>,
    laneReceivedAt: Date,
  ): Promise<Record<string, unknown> | undefined> {
    switch (action) {
      case 'join-competition': {
        const competitionId = command.competitionId as string;

        if (this.competitionId === competitionId) {
          getLogger().info(`[LaneTier1CommandHandler] Already joined competition: ${competitionId}`, 'mqtt');
          return undefined;
        }
        if (this.competitionId) {
          throw ErrorCatalog.createError('MQTT_ALREADY_IN_COMPETITION', {
            competitionId: this.competitionId,
          });
        }

        try {
          await this.activateCompetitionSubscriptions(competitionId);
        } catch (error) {
          await this.deactivateCompetitionSubscriptions();
          throw error;
        }

        this.deps.membership.setCompetitionId(competitionId);

        getLogger().info(`[LaneTier1CommandHandler] Joined competition: ${competitionId}`, 'mqtt');
        return undefined;
      }

      case 'leave-competition': {
        const competitionId = command.competitionId as string;

        if (!this.competitionId) {
          throw ErrorCatalog.createError('MQTT_NOT_IN_COMPETITION');
        }
        if (this.competitionId !== competitionId) {
          throw ErrorCatalog.createError('MQTT_COMPETITION_STATE_MISMATCH', {
            detail: `joined=${this.competitionId}, requested=${competitionId}`,
          });
        }

        this.cancelTimedTarget(competitionId, 'Lane left the competition');
        const shootOff = this.deps.competitionShootOffControl.getState();
        if (shootOff?.competitionId === competitionId) {
          this.deps.competitionShootOffControl.close(competitionId, shootOff.runId, shootOff.iteration);
        }
        await this.deps.retainPublisher.clearCompetitionTopics(competitionId, this.deps.getLaneId());
        const cleanup = await this.deactivateCompetitionSubscriptions();
        for (const result of cleanup) {
          if (result.status === 'rejected') throw result.reason;
        }

        this.deps.membership.setCompetitionId(null);

        getLogger().info(`[LaneTier1CommandHandler] Left competition: ${competitionId}`, 'mqtt');
        return undefined;
      }

      case 'probe-clock': {
        return {
          directorSentAt: command.directorSentAt as string,
          laneReceivedAt: laneReceivedAt.toISOString(),
          laneSentAt: new Date().toISOString(),
        };
      }

      case 'activate-safety-stop': {
        const state = await this.deps.safetyStopControl.activate({
          safetyStopId: command.safetyStopId as string,
          reason: command.reason as string,
          issuedBy: command.issuedBy as string,
          issuedAt: new Date(command.issuedAt as string),
        });
        const shootOff = this.deps.competitionShootOffControl.getState();
        if (shootOff) {
          this.deps.competitionShootOffControl.close(shootOff.competitionId, shootOff.runId, shootOff.iteration);
        }
        this.cancelTimedTarget(undefined, `Safety stop activated: ${state.reason}`);
        // A completed ACK means the retained state has also reached the broker.
        await this.deps.safetyStatePublisher.publishCurrentState();
        return toSafetyCommandData(state);
      }

      case 'clear-safety-stop': {
        const state = await this.deps.safetyStopControl.clear({
          safetyStopId: command.safetyStopId as string,
          clearanceReason: command.clearanceReason as string,
          confirmedSafe: command.confirmedSafe as true,
          clearedBy: command.issuedBy as string,
          clearedAt: new Date(command.issuedAt as string),
        });
        await this.deps.safetyStatePublisher.publishCurrentState();
        return toSafetyCommandData(state);
      }
    }
  }

  private cancelTimedTarget(competitionId: string | undefined, reason: string): void {
    const timedState = this.deps.timedTargetControl.getState(competitionId);
    if (!timedState || timedState.phase === 'COMPLETE' || timedState.phase === 'CANCELLED') return;
    this.deps.timedTargetControl.cancel({ sequenceId: timedState.sequenceId, reason });
  }

  private async activateCompetitionSubscriptions(competitionId: string): Promise<void> {
    // The state subscriber is first so the retained Director state can create
    // the matching local competition before any broadcast command is accepted.
    await this.deps.competitionStateSubscriber.subscribe(competitionId);
    await this.deps.competitionCueSubscriber.subscribe(competitionId);
    await this.deps.broadcastHandler.subscribeToCompetition(competitionId);
    await this.deps.perLaneHandler.subscribeToCompetition(competitionId);
    await this.deps.rpcHandler.subscribe(competitionId);
  }

  private deactivateCompetitionSubscriptions() {
    return Promise.allSettled([
      this.deps.broadcastHandler.unsubscribeFromCompetition(),
      this.deps.perLaneHandler.unsubscribeFromCompetition(),
      this.deps.rpcHandler.unsubscribe(),
      this.deps.competitionStateSubscriber.unsubscribe(),
      this.deps.competitionCueSubscriber.unsubscribe(),
    ]);
  }
}

function toSafetyCommandData(state: ReturnType<ILaneSafetyStopControl['getState']> & object): Record<string, unknown> {
  return {
    safetyStopId: state.safetyStopId,
    status: state.status,
    ...(state.timerSnapshot
      ? {
          competitionId: state.timerSnapshot.competitionId,
          remainingSeconds: state.timerSnapshot.remainingSeconds,
          totalSeconds: state.timerSnapshot.totalSeconds,
          frozenAt: state.timerSnapshot.frozenAt.toISOString(),
        }
      : {}),
    timerRestarted: false,
  };
}
