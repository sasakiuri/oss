// SPDX-License-Identifier: MIT
/**
 * RpcRequestHandler
 *
 * @description
 * Handler that processes MQTT RPC requests.
 * Subscribes to `saika/competition/{competitionId}/lane/{laneId}/query/+/request` and
 * retrieves data via QueryBus according to the method, then publishes to the response topic.
 */

import { GetCompetitionStateToken, GetSessionScoreToken, GetShotHistoryToken } from '@/main/composition/tokens';
import { RpcRequestSchema } from '@/main/modules/mqtt/domain/MqttRpcSchemas';
import type { IMqttClientService } from '@/main/modules/mqtt/infra/IMqttClientService';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

/** Parsed parts of the RPC request topic */
interface ParsedRpcTopic {
  competitionId: string;
  laneId: string;
  requestId: string;
}

export class RpcRequestHandler {
  private readonly mqttClient: IMqttClientService;
  private readonly storage: ILocalStorage;
  private readonly queryBus: QueryBus;
  private subscribedTopic: string | null = null;
  private messageUnsubscribe: (() => void) | null = null;

  constructor(mqttClient: IMqttClientService, storage: ILocalStorage, queryBus: QueryBus) {
    this.mqttClient = mqttClient;
    this.storage = storage;
    this.queryBus = queryBus;
  }

  /**
   * Subscribes to the RPC request topic
   *
   * @param competitionId - Target competition ID
   */
  async subscribe(competitionId: string): Promise<void> {
    await this.unsubscribe();

    const laneId = this.storage.get<string>('mqtt.laneId') ?? '';
    const topic = `saika/competition/${competitionId}/lane/${laneId}/query/+/request`;
    this.subscribedTopic = topic;

    await this.mqttClient.subscribe(topic, 1);

    this.messageUnsubscribe = this.mqttClient.onMessage((msgTopic: string, payload: Buffer) => {
      const parsed = this.parseTopic(msgTopic);
      if (!parsed) return;

      // Verify the target laneId matches this lane's laneId
      const currentLaneId = this.storage.get<string>('mqtt.laneId') ?? '';
      if (parsed.laneId !== currentLaneId) return;

      void this.handleRequest(parsed, payload);
    });
  }

  /**
   * Unsubscribes
   */
  async unsubscribe(): Promise<void> {
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
   * Parses the topic and determines whether it is an RPC request topic
   */
  private parseTopic(topic: string): ParsedRpcTopic | null {
    // saika/competition/{competitionId}/lane/{laneId}/query/{requestId}/request
    const segments = topic.split('/');
    if (segments.length !== 8) return null;
    if (segments[0] !== 'saika' || segments[1] !== 'competition') return null;
    if (segments[3] !== 'lane') return null;
    if (segments[5] !== 'query') return null;
    if (segments[7] !== 'request') return null;

    return {
      competitionId: segments[2]!,
      laneId: segments[4]!,
      requestId: segments[6]!,
    };
  }

  /**
   * Processes an RPC request
   */
  private async handleRequest(parsed: ParsedRpcTopic, payload: Buffer): Promise<void> {
    const logger = getLogger();
    const responseTopic = `saika/competition/${parsed.competitionId}/lane/${parsed.laneId}/query/${parsed.requestId}/response`;

    let rawData: unknown;
    try {
      rawData = JSON.parse(payload.toString());
    } catch {
      await this.publishError(
        responseTopic,
        parsed.requestId,
        'INVALID_JSON',
        'Failed to parse request JSON',
        'unknown',
      );
      return;
    }

    const parseResult = RpcRequestSchema.safeParse(rawData);
    if (!parseResult.success) {
      await this.publishError(responseTopic, parsed.requestId, 'INVALID_REQUEST', parseResult.error.message, 'unknown');
      return;
    }

    const request = parseResult.data;

    try {
      let result: unknown;

      switch (request.method) {
        case 'get-shot-list': {
          result = await this.queryBus.execute(GetShotHistoryToken, {
            sessionId: request.params.sessionId,
          });
          break;
        }
        case 'get-score': {
          result = await this.queryBus.execute(GetSessionScoreToken, {
            sessionId: request.params.sessionId,
          });
          break;
        }
        case 'get-competition-state': {
          result = await this.queryBus.execute(GetCompetitionStateToken, {
            competitionId: parsed.competitionId,
          });
          break;
        }
      }

      await this.publishSuccess(responseTopic, parsed.requestId, request.method, result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = (error as { code?: string }).code ?? 'INTERNAL_ERROR';
      logger.error(`[RpcRequestHandler] Failed to handle RPC request: ${request.method}`, 'mqtt', {
        error: errorMessage,
        requestId: parsed.requestId,
      });
      await this.publishError(responseTopic, parsed.requestId, errorCode, errorMessage, request.method);
    }
  }

  /**
   * Publishes a success response
   */
  private async publishSuccess(topic: string, requestId: string, method: string, result: unknown): Promise<void> {
    const response = JSON.stringify({
      requestId,
      method,
      ok: true,
      result,
      respondedAt: new Date().toISOString(),
    });

    await this.mqttClient.publish(topic, response, { qos: 1, retain: false });
  }

  /**
   * Publishes an error response
   */
  private async publishError(
    topic: string,
    requestId: string,
    code: string,
    message: string,
    method: string,
  ): Promise<void> {
    const response = JSON.stringify({
      requestId,
      method,
      ok: false,
      error: { code, message },
      respondedAt: new Date().toISOString(),
    });

    try {
      await this.mqttClient.publish(topic, response, { qos: 1, retain: false });
    } catch (err) {
      getLogger().error('[RpcRequestHandler] Failed to publish error response', 'mqtt', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
