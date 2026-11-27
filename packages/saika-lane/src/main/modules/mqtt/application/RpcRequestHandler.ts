// SPDX-License-Identifier: MIT
/** Answers competition query requests through QueryBus and the MQTT response topic. */

import { mqttTopicFilters, mqttTopics, parseMqttTopic, type ParsedMqttTopicOf } from '@sasakiuri/saika-protocol/topics';

import { GetCompetitionStateToken, GetSessionScoreToken, GetShotHistoryToken } from '@/main/composition/tokens';
import { TopicSubscription } from '@/main/modules/mqtt/application/TopicSubscription';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import { RpcRequestSchema } from '@/main/modules/mqtt/domain/MqttRpcSchemas';
import { readMirroredLaneId } from '@/main/modules/settings/application/MirroredLaneId';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { errorMessage } from '@/shared/errors/errorMessage';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

type RpcRequestTopic = ParsedMqttTopicOf<'laneQueryRequest'>;

export class RpcRequestHandler {
  private readonly mqttClient: IMqttClientService;
  private readonly storage: ILocalStorage;
  private readonly queryBus: QueryBus;
  private readonly subscription: TopicSubscription;

  constructor(mqttClient: IMqttClientService, storage: ILocalStorage, queryBus: QueryBus) {
    this.mqttClient = mqttClient;
    this.storage = storage;
    this.queryBus = queryBus;
    this.subscription = new TopicSubscription(mqttClient, {
      listenBeforeSubscribe: false,
      unsubscribeErrors: 'rethrow-while-connected',
    });
  }

  /**
   * Subscribes to the RPC request topic
   *
   * @param competitionId - Target competition ID
   */
  async subscribe(competitionId: string): Promise<void> {
    await this.unsubscribe();

    const laneId = readMirroredLaneId(this.storage);
    await this.subscription.open(mqttTopicFilters.laneQueryRequests(competitionId, laneId), (msgTopic, payload) => {
      const parsed = parseMqttTopic(msgTopic);
      if (parsed?.kind !== 'laneQueryRequest') return;

      // Verify the target laneId matches this lane's laneId
      const currentLaneId = readMirroredLaneId(this.storage);
      if (parsed.laneId !== currentLaneId) return;

      void this.handleRequest(parsed, payload);
    });
  }

  /**
   * Unsubscribes
   */
  async unsubscribe(): Promise<void> {
    await this.subscription.close();
  }

  /**
   * Processes an RPC request
   */
  private async handleRequest(parsed: RpcRequestTopic, payload: Buffer): Promise<void> {
    const logger = getLogger();
    const responseTopic = mqttTopics.laneQueryResponse(parsed.competitionId, parsed.laneId, parsed.requestId);

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
      const message = errorMessage(error);
      const errorCode = (error as { code?: string }).code ?? 'INTERNAL_ERROR';
      logger.error(`[RpcRequestHandler] Failed to handle RPC request: ${request.method}`, 'mqtt', {
        error: message,
        requestId: parsed.requestId,
      });
      await this.publishError(responseTopic, parsed.requestId, errorCode, message, request.method);
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
        error: errorMessage(err),
      });
    }
  }
}
