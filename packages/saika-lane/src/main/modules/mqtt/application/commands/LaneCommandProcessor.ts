// SPDX-License-Identifier: MIT
import type { CommandAcknowledgement } from '@sasakiuri/saika-protocol/Acknowledgement';
import type { z } from 'zod';

import type { ICommandAuthorizationPolicy } from '@/main/modules/mqtt/domain/CommandAuthorizationPolicy';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

import type { CommandIdempotencyGuard } from './CommandIdempotencyGuard';

interface CommandEnvelope {
  commandId: string;
  issuedBy: string;
  issuerId?: string;
}

/** Receive-side facts every handler declares for each action it accepts. */
export interface LaneCommandDescriptor {
  readonly schema: z.ZodType<CommandEnvelope>;
  /** The action is rejected until Lane startup is READY. */
  readonly requiresReady: boolean;
}

export type LaneCommandTable = Readonly<Record<string, LaneCommandDescriptor>>;

/** One validated command as `[action, command]`, with the payload type of that action. */
export type LaneCommandArgs<Table extends LaneCommandTable> = {
  [Action in keyof Table & string]: [action: Action, command: z.output<Table[Action]['schema']>];
}[keyof Table & string];

/** As {@link LaneCommandArgs}, followed by the time the Lane received the command. */
export type ReceivedLaneCommandArgs<Table extends LaneCommandTable> = {
  [Action in keyof Table & string]: [action: Action, command: z.output<Table[Action]['schema']>, receivedAt: Date];
}[keyof Table & string];

/** Joins the protocol payload schema of each action with the handler's policy for that action. */
export function laneCommandTable<
  Schemas extends Readonly<Record<string, z.ZodType<CommandEnvelope>>>,
  Policies extends { readonly [Action in keyof Schemas]: { readonly requiresReady: boolean } },
>(schemas: Schemas, policies: Policies): LaneCommandTableOf<Schemas, Policies> {
  const entries = Object.entries(schemas).map(([action, schema]) => [action, { ...policies[action], schema }]);
  return Object.fromEntries(entries) as LaneCommandTableOf<Schemas, Policies>;
}

type LaneCommandTableOf<Schemas, Policies extends { readonly [Action in keyof Schemas]: unknown }> = {
  readonly [Action in keyof Schemas]: Policies[Action] & { readonly schema: Schemas[Action] };
};

export interface CommandPreparation {
  skip?: boolean;
  warning?: string;
}

interface CommandRequest<Table extends LaneCommandTable> {
  /** Log prefix naming the handler that received the command. */
  logContext: string;
  action: string;
  payload: Buffer;
  acknowledgementTopic: string;
  commands: Table;
  prepare?: (...command: LaneCommandArgs<Table>) => CommandPreparation;
  execute: (...command: ReceivedLaneCommandArgs<Table>) => Promise<Record<string, unknown> | void>;
}

export interface LaneCommandProcessorDeps {
  mqttClient: Pick<IMqttClientService, 'publish'>;
  idempotencyGuard: Pick<CommandIdempotencyGuard, 'check'>;
  commandAuthorization: ICommandAuthorizationPolicy;
  getLaneId: () => string;
  isReady: () => boolean;
}

/** Shared receive boundary for validation, authorization, deduplication and two-phase acknowledgements. */
export class LaneCommandProcessor {
  constructor(private readonly deps: LaneCommandProcessorDeps) {}

  async handle<Table extends LaneCommandTable>(request: CommandRequest<Table>): Promise<void> {
    const receivedAt = new Date();
    const { logContext, action, payload, acknowledgementTopic: topic } = request;
    const logger = getLogger();
    let rawData: unknown;
    try {
      rawData = JSON.parse(payload.toString());
    } catch {
      logger.error(`[${logContext}] Failed to parse JSON`, 'mqtt', { action });
      return;
    }

    // Incoming actions must be own registry entries, never Object prototype members.
    if (!Object.hasOwn(request.commands, action)) {
      const error = ErrorCatalog.createError('MQTT_UNKNOWN_COMMAND_ACTION', { action });
      await this.publishAck(logContext, topic, { commandId: '', status: 'error', error });
      return;
    }
    const descriptor: LaneCommandDescriptor = request.commands[action]!;
    const parsed = descriptor.schema.safeParse(rawData);
    if (!parsed.success) {
      const error = ErrorCatalog.createError('MQTT_COMMAND_VALIDATION_FAILED', {
        action,
        detail: parsed.error.message,
      });
      const commandId = stringProperty(rawData, 'commandId') ?? '';
      await this.publishAck(logContext, topic, { commandId, status: 'error', error });
      return;
    }

    const command = parsed.data;
    const { commandId } = command;
    const authorization = this.deps.commandAuthorization.assess({
      issuedBy: command.issuedBy,
      ...(command.issuerId !== undefined ? { issuerId: command.issuerId } : {}),
    });
    if (!authorization.allowed) {
      const error = ErrorCatalog.createError('MQTT_COMMAND_UNAUTHORIZED', { detail: authorization.reason });
      await this.publishAck(logContext, topic, { commandId, status: 'error', error });
      return;
    }
    // The payload was parsed with this action's schema, so the pair matches one member of the typed union.
    const received = [action, command] as LaneCommandArgs<Table>;
    try {
      const preparation = request.prepare?.(...received);
      if (preparation?.skip) return;
      if (descriptor.requiresReady && !this.deps.isReady())
        throw new Error('Lane startup is not READY. Recover the saved run before issuing competition commands.');
      if (this.deps.idempotencyGuard.check(commandId)) {
        logger.info(`[${logContext}] Duplicate command skipped: ${commandId}`, 'mqtt');
        return;
      }
      const warning = [authorization.warning, preparation?.warning].filter(Boolean).join('; ') || undefined;
      await this.publishAck(logContext, topic, { commandId, status: 'executing' });
      const data = await request.execute(...([...received, receivedAt] as ReceivedLaneCommandArgs<Table>));
      await this.publishAck(logContext, topic, {
        commandId,
        status: 'done',
        ...(data ? { data } : {}),
        ...(warning ? { warning } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = stringProperty(error, 'code') ?? 'MQTT_COMMAND_EXECUTION_FAILED';
      logger.error(`[${logContext}] Command failed: ${action}`, 'mqtt', { error: message, commandId });
      await this.publishAck(logContext, topic, { commandId, status: 'error', error: { code, message } });
    }
  }

  private async publishAck(
    logContext: string,
    topic: string,
    result: Omit<CommandAcknowledgement, 'laneId' | 'acknowledgedAt'>,
  ): Promise<void> {
    const ack: CommandAcknowledgement = {
      ...result,
      // DomainError contains internal metadata; only the wire error fields belong in an ACK.
      ...(result.error ? { error: { code: result.error.code, message: result.error.message } } : {}),
      laneId: this.deps.getLaneId(),
      acknowledgedAt: new Date().toISOString(),
    };
    try {
      await this.deps.mqttClient.publish(topic, JSON.stringify(ack), { qos: 1, retain: false });
    } catch (error) {
      getLogger().error(`[${logContext}] Failed to publish ACK`, 'mqtt', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function stringProperty(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null || !(key in value)) return undefined;
  const property = (value as Record<string, unknown>)[key];
  return typeof property === 'string' ? property : undefined;
}
