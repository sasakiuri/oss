// SPDX-License-Identifier: MIT
/** Handles competition membership and starts competition subscriptions after joining. */

import type { ICompetitionShootOffControl } from '@/main/modules/competition-shoot-off';
import type { CommandIdempotencyGuard } from '@/main/modules/mqtt/application/commands/CommandIdempotencyGuard';
import type { CompetitionCueSubscriber } from '@/main/modules/mqtt/application/CompetitionCueSubscriber';
import type { CompetitionStateSubscriber } from '@/main/modules/mqtt/application/CompetitionStateSubscriber';
import type { DirectorMembership } from '@/main/modules/mqtt/application/DirectorMembership';
import type { LaneSafetyStatePublisher } from '@/main/modules/mqtt/application/LaneSafetyStatePublisher';
import type { RetainPublisher } from '@/main/modules/mqtt/application/RetainPublisher';
import type { RpcRequestHandler } from '@/main/modules/mqtt/application/RpcRequestHandler';
import {
  CommandAuthorizationPolicy,
  type ICommandAuthorizationPolicy,
} from '@/main/modules/mqtt/domain/CommandAuthorizationPolicy';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import {
  ActivateSafetyStopCmdSchema,
  ClearSafetyStopCmdSchema,
  JoinCompetitionCmdSchema,
  LeaveCompetitionCmdSchema,
  ProbeClockCmdSchema,
} from '@/main/modules/mqtt/domain/MqttCommandSchemas';
import type { ILaneSafetyStopControl } from '@/main/modules/safety-stop';
import type { ITimedTargetControl } from '@/main/modules/timed-target';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

import type { BroadcastCommandHandler } from './BroadcastCommandHandler';
import { LaneCommandProcessor, type LaneCommandSchemas } from './LaneCommandProcessor';
import type { PerLaneCommandHandler } from './PerLaneCommandHandler';

type Tier1Action =
  'join-competition' | 'leave-competition' | 'probe-clock' | 'activate-safety-stop' | 'clear-safety-stop';

const ACTION_SCHEMAS: LaneCommandSchemas<Tier1Action> = {
  'join-competition': JoinCompetitionCmdSchema,
  'leave-competition': LeaveCompetitionCmdSchema,
  'probe-clock': ProbeClockCmdSchema,
  'activate-safety-stop': ActivateSafetyStopCmdSchema,
  'clear-safety-stop': ClearSafetyStopCmdSchema,
};

/** Parsed parts of the topic */
interface ParsedTier1Topic {
  laneId: string;
  action: string;
}

export class LaneTier1CommandHandler {
  private readonly processor: LaneCommandProcessor;
  private subscribedTopic: string | null = null;
  private messageUnsubscribe: (() => void) | null = null;

  constructor(
    private readonly mqttClient: IMqttClientService,
    idempotencyGuard: CommandIdempotencyGuard,
    private readonly broadcastHandler: BroadcastCommandHandler,
    private readonly perLaneHandler: PerLaneCommandHandler,
    private readonly rpcHandler: RpcRequestHandler,
    private readonly competitionStateSubscriber: CompetitionStateSubscriber,
    private readonly retainPublisher: RetainPublisher,
    private readonly membership: DirectorMembership,
    private readonly getLaneId: () => string,
    private readonly safetyStopControl?: ILaneSafetyStopControl,
    private readonly safetyStatePublisher?: LaneSafetyStatePublisher,
    private readonly competitionCueSubscriber?: CompetitionCueSubscriber,
    private readonly competitionShootOffControl?: ICompetitionShootOffControl,
    commandAuthorization: ICommandAuthorizationPolicy = new CommandAuthorizationPolicy(),
    private readonly timedTargetControl?: ITimedTargetControl,
  ) {
    this.processor = new LaneCommandProcessor(
      mqttClient,
      idempotencyGuard,
      commandAuthorization,
      getLaneId,
      'LaneTier1CommandHandler',
    );
  }

  /**
   * Subscribes to Tier1 commands
   */
  async subscribe(): Promise<void> {
    await this.unsubscribeTier1Topic();

    const topic = `saika/lane/${this.getLaneId()}/command/+`;
    this.subscribedTopic = topic;

    this.messageUnsubscribe = this.mqttClient.onMessage((msgTopic: string, payload: Buffer) => {
      const parsed = this.parseTopic(msgTopic);
      if (!parsed) return;
      if (parsed.laneId !== this.getLaneId()) return;

      void this.handleCommand(parsed, payload);
    });

    await this.mqttClient.subscribe(topic, 1);

    const savedCompetitionId = this.competitionId;
    if (savedCompetitionId) {
      try {
        await this.activateCompetitionSubscriptions(savedCompetitionId);
      } catch (error) {
        await this.deactivateCompetitionSubscriptions();
        this.membership.setCompetitionId(null);
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
    this.messageUnsubscribe?.();
    this.messageUnsubscribe = null;

    if (this.subscribedTopic) {
      try {
        await this.mqttClient.unsubscribe(this.subscribedTopic);
      } catch {
        // Ignore if already disconnected
      }
      this.subscribedTopic = null;
    }
  }

  /**
   * Returns the competition ID currently joined
   */
  get competitionId(): string | null {
    return this.membership.snapshot.competitionId;
  }

  /**
   * Parses the topic
   * saika/lane/{laneId}/command/{action}
   */
  private parseTopic(topic: string): ParsedTier1Topic | null {
    const segments = topic.split('/');
    if (segments.length !== 5) return null;
    if (segments[0] !== 'saika' || segments[1] !== 'lane') return null;
    if (segments[3] !== 'command') return null;

    return {
      laneId: segments[2]!,
      action: segments[4]!,
    };
  }

  /**
   * Processes a command
   */
  private handleCommand(parsed: ParsedTier1Topic, payload: Buffer): Promise<void> {
    return this.processor.handle<Tier1Action>({
      action: parsed.action,
      payload,
      schemas: ACTION_SCHEMAS,
      acknowledgementTopic: `saika/lane/${this.getLaneId()}/command/${parsed.action}/acknowledgement`,
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

        this.membership.setCompetitionId(competitionId);

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
        const shootOff = this.competitionShootOffControl?.getState();
        if (shootOff?.competitionId === competitionId) {
          this.competitionShootOffControl?.close(competitionId, shootOff.runId, shootOff.iteration);
        }
        await this.retainPublisher.clearCompetitionTopics(competitionId, this.getLaneId());
        const cleanup = await this.deactivateCompetitionSubscriptions();
        for (const result of cleanup) {
          if (result.status === 'rejected') throw result.reason;
        }

        this.membership.setCompetitionId(null);

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
        const safetyStopControl = this.requireSafetyStopControl();
        const state = await safetyStopControl.activate({
          safetyStopId: command.safetyStopId as string,
          reason: command.reason as string,
          issuedBy: command.issuedBy as string,
          issuedAt: new Date(command.issuedAt as string),
        });
        const shootOff = this.competitionShootOffControl?.getState();
        if (shootOff) {
          this.competitionShootOffControl?.close(shootOff.competitionId, shootOff.runId, shootOff.iteration);
        }
        this.cancelTimedTarget(undefined, `Safety stop activated: ${state.reason}`);
        // A completed ACK means the retained state has also reached the broker.
        await this.safetyStatePublisher?.publishCurrentState();
        return toSafetyCommandData(state);
      }

      case 'clear-safety-stop': {
        const safetyStopControl = this.requireSafetyStopControl();
        const state = await safetyStopControl.clear({
          safetyStopId: command.safetyStopId as string,
          clearanceReason: command.clearanceReason as string,
          confirmedSafe: command.confirmedSafe as true,
          clearedBy: command.issuedBy as string,
          clearedAt: new Date(command.issuedAt as string),
        });
        await this.safetyStatePublisher?.publishCurrentState();
        return toSafetyCommandData(state);
      }
    }
  }

  private cancelTimedTarget(competitionId: string | undefined, reason: string): void {
    const timedState = this.timedTargetControl?.getState(competitionId);
    if (!timedState || timedState.phase === 'COMPLETE' || timedState.phase === 'CANCELLED') return;
    this.timedTargetControl?.cancel({ sequenceId: timedState.sequenceId, reason });
  }

  private async activateCompetitionSubscriptions(competitionId: string): Promise<void> {
    // The state subscriber is first so the retained Director state can create
    // the matching local competition before any broadcast command is accepted.
    await this.competitionStateSubscriber.subscribe(competitionId);
    await this.competitionCueSubscriber?.subscribe(competitionId);
    await this.broadcastHandler.subscribeToCompetition(competitionId);
    await this.perLaneHandler.subscribeToCompetition(competitionId);
    await this.rpcHandler.subscribe(competitionId);
  }

  private requireSafetyStopControl(): ILaneSafetyStopControl {
    if (!this.safetyStopControl) throw new Error('Lane safety stop control is unavailable');
    return this.safetyStopControl;
  }

  private deactivateCompetitionSubscriptions() {
    return Promise.allSettled([
      this.broadcastHandler.unsubscribeFromCompetition(),
      this.perLaneHandler.unsubscribeFromCompetition(),
      this.rpcHandler.unsubscribe(),
      this.competitionStateSubscriber.unsubscribe(),
      this.competitionCueSubscriber?.unsubscribe(),
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
