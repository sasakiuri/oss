// SPDX-License-Identifier: MIT
import type { z } from 'zod';

import type { ICommandAuthorizationPolicy } from '@/main/modules/mqtt/domain/CommandAuthorizationPolicy';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import type { CommandAckPayload } from '@/main/modules/mqtt/domain/MqttCommandSchemas';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

import type { CommandIdempotencyGuard } from './CommandIdempotencyGuard';

type CommandEnvelope = Record<string, unknown> & {
  commandId: string;
  issuedBy: string;
  issuerId?: string;
};

export type LaneCommandSchemas<Action extends string> = Record<Action, z.ZodType<CommandEnvelope>>;

export interface CommandPreparation {
  skip?: boolean;
  warning?: string;
}

interface CommandRequest<Action extends string> {
  action: string;
  payload: Buffer;
  acknowledgementTopic: string;
  schemas: LaneCommandSchemas<Action>;
  prepare?: (action: Action, command: CommandEnvelope) => CommandPreparation;
  execute: (action: Action, command: CommandEnvelope, receivedAt: Date) => Promise<Record<string, unknown> | void>;
}

/** Shared receive boundary for validation, authorization, deduplication and two-phase acknowledgements. */
export class LaneCommandProcessor {
  constructor(
    private readonly mqttClient: Pick<IMqttClientService, 'publish'>,
    private readonly idempotencyGuard: Pick<CommandIdempotencyGuard, 'check'>,
    private readonly commandAuthorization: ICommandAuthorizationPolicy,
    private readonly getLaneId: () => string,
    private readonly logContext: string,
  ) {}

  async handle<Action extends string>(request: CommandRequest<Action>): Promise<void> {
    const receivedAt = new Date();
    const { action, payload, acknowledgementTopic: topic } = request;
    const logger = getLogger();
    let rawData: unknown;
    try {
      rawData = JSON.parse(payload.toString());
    } catch {
      logger.error(`[${this.logContext}] Failed to parse JSON`, 'mqtt', { action });
      return;
    }

    // Incoming actions must be own registry entries, never Object prototype members.
    if (!Object.hasOwn(request.schemas, action)) {
      const error = ErrorCatalog.createError('MQTT_UNKNOWN_COMMAND_ACTION', { action });
      await this.publishAck(topic, { commandId: '', status: 'error', error });
      return;
    }
    const knownAction = action as Action;
    const parsed = request.schemas[knownAction].safeParse(rawData);
    if (!parsed.success) {
      const error = ErrorCatalog.createError('MQTT_COMMAND_VALIDATION_FAILED', {
        action,
        detail: parsed.error.message,
      });
      const commandId = stringProperty(rawData, 'commandId') ?? '';
      await this.publishAck(topic, { commandId, status: 'error', error });
      return;
    }

    const command = parsed.data;
    const { commandId } = command;
    const authorization = this.commandAuthorization.assess({
      issuedBy: command.issuedBy,
      ...(command.issuerId !== undefined ? { issuerId: command.issuerId } : {}),
    });
    if (!authorization.allowed) {
      const error = ErrorCatalog.createError('MQTT_COMMAND_UNAUTHORIZED', { detail: authorization.reason });
      await this.publishAck(topic, { commandId, status: 'error', error });
      return;
    }
    if (this.idempotencyGuard.check(commandId)) {
      logger.info(`[${this.logContext}] Duplicate command skipped: ${commandId}`, 'mqtt');
      return;
    }

    try {
      const preparation = request.prepare?.(knownAction, command);
      if (preparation?.skip) return;
      const warning = [authorization.warning, preparation?.warning].filter(Boolean).join('; ') || undefined;
      await this.publishAck(topic, { commandId, status: 'executing' });
      const data = await request.execute(knownAction, command, receivedAt);
      await this.publishAck(topic, {
        commandId,
        status: 'done',
        ...(data ? { data } : {}),
        ...(warning ? { warning } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = stringProperty(error, 'code') ?? 'MQTT_COMMAND_EXECUTION_FAILED';
      logger.error(`[${this.logContext}] Command failed: ${action}`, 'mqtt', { error: message, commandId });
      await this.publishAck(topic, { commandId, status: 'error', error: { code, message } });
    }
  }

  private async publishAck(topic: string, result: Omit<CommandAckPayload, 'laneId' | 'acknowledgedAt'>): Promise<void> {
    const ack: CommandAckPayload = {
      ...result,
      // DomainError contains internal metadata; only the wire error fields belong in an ACK.
      ...(result.error ? { error: { code: result.error.code, message: result.error.message } } : {}),
      laneId: this.getLaneId(),
      acknowledgedAt: new Date().toISOString(),
    };
    try {
      await this.mqttClient.publish(topic, JSON.stringify(ack), { qos: 1, retain: false });
    } catch (error) {
      getLogger().error(`[${this.logContext}] Failed to publish ACK`, 'mqtt', {
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
