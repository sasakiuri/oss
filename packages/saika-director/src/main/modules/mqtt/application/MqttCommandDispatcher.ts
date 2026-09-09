// SPDX-License-Identifier: MIT
import type { CommandAcknowledgement } from '@/shared/mqtt';
import type { IMqttTransport } from '../domain/IMqttTransport';
import type { DirectorCommandAction, CommandExecutionResult, LaneCommandResult } from './DirectorMqttTypes';

interface PendingCommand {
  action: DirectorCommandAction;
  expectedLaneIds: Set<string>;
  expectedAcknowledgementTopics: Map<string, string>;
  acknowledgements: Map<string, CommandAcknowledgement>;
  resolve: (result: CommandExecutionResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface PublishCommandOptions {
  action: DirectorCommandAction;
  topic: string;
  acknowledgementTopic: (laneId: string) => string;
  payload: Record<string, unknown> & { commandId: string };
  expectedLaneIds: string[];
  onPublished?: () => void;
}

export class MqttCommandDispatcher {
  private readonly pendingCommands = new Map<string, PendingCommand>();

  constructor(
    private readonly transport: Pick<IMqttTransport, 'publish'>,
    private readonly commandTimeoutMs: number,
    private readonly callbacks: {
      onCompleted: (result: CommandExecutionResult) => void;
      onProgress: () => void;
      onError: (error: unknown) => void;
      onDebugLog: (message: string) => void;
    },
  ) {}

  acknowledge(topic: string, acknowledgement: CommandAcknowledgement): void {
    const pending = this.pendingCommands.get(acknowledgement.commandId);
    if (pending?.expectedAcknowledgementTopics.get(acknowledgement.laneId) !== topic) return;

    const previous = pending.acknowledgements.get(acknowledgement.laneId);
    if (previous?.status === 'done' || previous?.status === 'error') return;

    pending.acknowledgements.set(acknowledgement.laneId, acknowledgement);
    this.callbacks.onProgress();
    if (acknowledgement.status === 'executing') return;

    const terminalCount = [...pending.acknowledgements.values()].filter(
      (ack) => ack.status === 'done' || ack.status === 'error',
    ).length;
    if (terminalCount === pending.expectedLaneIds.size) {
      this.completePendingCommand(acknowledgement.commandId, pending);
    }
  }

  async publish(options: PublishCommandOptions): Promise<CommandExecutionResult> {
    const expectedLaneIds = [...new Set(options.expectedLaneIds)];

    if (expectedLaneIds.length === 0) {
      await this.transport.publish(options.topic, JSON.stringify(options.payload), {
        qos: 1,
        retain: false,
      });
      options.onPublished?.();
      const result: CommandExecutionResult = {
        commandId: options.payload.commandId,
        action: options.action,
        success: true,
        lanes: [],
      };
      this.callbacks.onCompleted(result);
      return result;
    }

    const resultPromise = new Promise<CommandExecutionResult>((resolve) => {
      const timer = setTimeout(() => {
        const pending = this.pendingCommands.get(options.payload.commandId);
        if (pending) this.completePendingCommand(options.payload.commandId, pending);
      }, this.commandTimeoutMs);

      this.pendingCommands.set(options.payload.commandId, {
        action: options.action,
        expectedLaneIds: new Set(expectedLaneIds),
        expectedAcknowledgementTopics: new Map(
          expectedLaneIds.map((laneId) => [laneId, options.acknowledgementTopic(laneId)]),
        ),
        acknowledgements: new Map(),
        resolve,
        timer,
      });
    });

    const publishPromise = this.transport
      .publish(options.topic, JSON.stringify(options.payload), {
        qos: 1,
        retain: false,
      })
      .then(() => options.onPublished?.());

    try {
      const outcome = await Promise.race([
        publishPromise.then(() => ({ type: 'published' as const })),
        resultPromise.then((result) => ({ type: 'completed' as const, result })),
      ]);
      if (outcome.type === 'completed') {
        // MQTT.js can keep a QoS 1 publish pending indefinitely while waiting
        // for the broker acknowledgement. The command deadline must still
        // release Director's per-competition operation queue; observe the
        // late publish so a subsequent rejection cannot become unhandled.
        void publishPromise.catch((error: unknown) => this.callbacks.onError(error));
        return outcome.result;
      }
      this.callbacks.onDebugLog(`Published ${options.action} (${options.payload.commandId})`);
    } catch (error) {
      const pending = this.pendingCommands.get(options.payload.commandId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingCommands.delete(options.payload.commandId);
      }
      throw error;
    }

    return resultPromise;
  }

  private completePendingCommand(commandId: string, pending: PendingCommand): void {
    clearTimeout(pending.timer);
    this.pendingCommands.delete(commandId);
    const lanes: LaneCommandResult[] = [...pending.expectedLaneIds].map((laneId) => {
      const acknowledgement = pending.acknowledgements.get(laneId);
      if (!acknowledgement || acknowledgement.status === 'executing') {
        return { laneId, status: 'timeout' };
      }
      if (
        acknowledgement.status === 'error' &&
        ((pending.action === 'finish-competition' && acknowledgement.error?.code === 'COMPETITION_ALREADY_FINISHED') ||
          (pending.action === 'leave-competition' && acknowledgement.error?.code === 'MQTT_NOT_IN_COMPETITION'))
      ) {
        return {
          laneId,
          status: 'done',
          warning: acknowledgement.error.message,
          acknowledgedAt: acknowledgement.acknowledgedAt,
        };
      }
      return {
        laneId,
        status: acknowledgement.status,
        ...(acknowledgement.error ? { error: acknowledgement.error } : {}),
        ...(acknowledgement.warning ? { warning: acknowledgement.warning } : {}),
        ...(acknowledgement.data ? { data: acknowledgement.data } : {}),
        acknowledgedAt: acknowledgement.acknowledgedAt,
      };
    });
    const result: CommandExecutionResult = {
      commandId,
      action: pending.action,
      success: lanes.every((lane) => lane.status === 'done'),
      lanes,
    };
    this.callbacks.onCompleted(result);
    pending.resolve(result);
  }

  cancelPending(): void {
    for (const [commandId, pending] of this.pendingCommands) {
      this.completePendingCommand(commandId, pending);
    }
  }
}
