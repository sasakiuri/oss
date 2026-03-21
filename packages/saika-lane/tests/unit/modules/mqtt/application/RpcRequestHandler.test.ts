// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GetCompetitionStateToken, GetSessionScoreToken, GetShotHistoryToken } from '@/main/composition/tokens';
import { RpcRequestHandler } from '@/main/modules/mqtt/application/RpcRequestHandler';
import type { IMqttClientService } from '@/main/modules/mqtt/infra/IMqttClientService';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const COMPETITION_ID = '550e8400-e29b-41d4-a716-446655440000';
const LANE_ID = '660e8400-e29b-41d4-a716-446655440001';
const REQUEST_ID = '770e8400-e29b-41d4-a716-446655440002';
const SESSION_ID = '880e8400-e29b-41d4-a716-446655440003';

function createRequestTopic(requestId: string = REQUEST_ID): string {
  return `saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/query/${requestId}/request`;
}

function createResponseTopic(requestId: string = REQUEST_ID): string {
  return `saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/query/${requestId}/response`;
}

describe('RpcRequestHandler', () => {
  let mockMqttClient: IMqttClientService;
  let mockStorage: ILocalStorage;
  let mockQueryBus: QueryBus;
  let handler: RpcRequestHandler;
  let messageHandler: (topic: string, payload: Buffer) => void;

  beforeEach(() => {
    messageHandler = vi.fn();

    mockMqttClient = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      setWill: vi.fn(),
      onMessage: vi.fn((handler: (topic: string, payload: Buffer) => void) => {
        messageHandler = handler;
        return () => {
          /* unsubscribe */
        };
      }),
      onConnect: vi.fn(),
      onDisconnect: vi.fn(),
      isConnected: vi.fn().mockReturnValue(true),
    };

    mockStorage = {
      get: vi.fn((key: string) => {
        if (key === 'mqtt.laneId') return LANE_ID;
        return undefined;
      }),
      set: vi.fn(),
      delete: vi.fn(),
      has: vi.fn(),
    } as unknown as ILocalStorage;

    mockQueryBus = {
      execute: vi.fn(),
      register: vi.fn(),
    } as unknown as QueryBus;

    handler = new RpcRequestHandler(mockMqttClient, mockStorage, mockQueryBus);
  });

  describe('subscribe()', () => {
    it('subscribes to RPC request topic', async () => {
      await handler.subscribe(COMPETITION_ID);

      expect(mockMqttClient.subscribe).toHaveBeenCalledWith(
        `saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/query/+/request`,
        1,
      );
    });

    it('registers onMessage handler', async () => {
      await handler.subscribe(COMPETITION_ID);

      expect(mockMqttClient.onMessage).toHaveBeenCalled();
    });

    it('unsubscribes from previous topic when resubscribing', async () => {
      await handler.subscribe(COMPETITION_ID);
      await handler.subscribe(COMPETITION_ID);

      expect(mockMqttClient.unsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe('unsubscribe()', () => {
    it('unsubscribes', async () => {
      await handler.subscribe(COMPETITION_ID);
      await handler.unsubscribe();

      expect(mockMqttClient.unsubscribe).toHaveBeenCalled();
    });

    it('does nothing when not subscribed', async () => {
      await handler.unsubscribe();

      expect(mockMqttClient.unsubscribe).not.toHaveBeenCalled();
    });
  });

  describe('handleRequest — get-shot-list', () => {
    it('calls QueryBus with GetShotHistoryToken', async () => {
      const mockResult = { shots: [{ score: 10.5 }] };
      vi.mocked(mockQueryBus.execute).mockResolvedValue(mockResult);

      await handler.subscribe(COMPETITION_ID);
      const payload = Buffer.from(
        JSON.stringify({
          requestId: REQUEST_ID,
          method: 'get-shot-list',
          params: { sessionId: SESSION_ID },
        }),
      );
      messageHandler(createRequestTopic(), payload);

      // Allow async processing
      await vi.waitFor(() => {
        expect(mockQueryBus.execute).toHaveBeenCalledWith(GetShotHistoryToken, { sessionId: SESSION_ID });
      });
    });

    it('publishes success response', async () => {
      const mockResult = { shots: [] };
      vi.mocked(mockQueryBus.execute).mockResolvedValue(mockResult);

      await handler.subscribe(COMPETITION_ID);
      const payload = Buffer.from(
        JSON.stringify({
          requestId: REQUEST_ID,
          method: 'get-shot-list',
          params: { sessionId: SESSION_ID },
        }),
      );
      messageHandler(createRequestTopic(), payload);

      await vi.waitFor(() => {
        expect(mockMqttClient.publish).toHaveBeenCalledWith(
          createResponseTopic(),
          expect.stringContaining('"ok":true'),
          { qos: 1, retain: false },
        );
      });
    });
  });

  describe('handleRequest — get-score', () => {
    it('calls QueryBus with GetSessionScoreToken', async () => {
      const mockResult = { totalScore: 580 };
      vi.mocked(mockQueryBus.execute).mockResolvedValue(mockResult);

      await handler.subscribe(COMPETITION_ID);
      const payload = Buffer.from(
        JSON.stringify({
          requestId: REQUEST_ID,
          method: 'get-score',
          params: { sessionId: SESSION_ID },
        }),
      );
      messageHandler(createRequestTopic(), payload);

      await vi.waitFor(() => {
        expect(mockQueryBus.execute).toHaveBeenCalledWith(GetSessionScoreToken, { sessionId: SESSION_ID });
      });
    });
  });

  describe('handleRequest — get-competition-state', () => {
    it('calls QueryBus with GetCompetitionStateToken', async () => {
      const mockResult = { phase: 'ACTIVE', stageIndex: 0 };
      vi.mocked(mockQueryBus.execute).mockResolvedValue(mockResult);

      await handler.subscribe(COMPETITION_ID);
      const payload = Buffer.from(
        JSON.stringify({
          requestId: REQUEST_ID,
          method: 'get-competition-state',
          params: {},
        }),
      );
      messageHandler(createRequestTopic(), payload);

      await vi.waitFor(() => {
        expect(mockQueryBus.execute).toHaveBeenCalledWith(GetCompetitionStateToken, { competitionId: COMPETITION_ID });
      });
    });
  });

  describe('error handling', () => {
    it('returns error response for invalid JSON', async () => {
      await handler.subscribe(COMPETITION_ID);
      const payload = Buffer.from('invalid json{{{');
      messageHandler(createRequestTopic(), payload);

      await vi.waitFor(() => {
        expect(mockMqttClient.publish).toHaveBeenCalledWith(
          createResponseTopic(),
          expect.stringContaining('"ok":false'),
          { qos: 1, retain: false },
        );
      });

      const publishedPayload = JSON.parse(vi.mocked(mockMqttClient.publish).mock.calls[0]![1] as string);
      expect(publishedPayload.error.code).toBe('INVALID_JSON');
    });

    it('returns error response for invalid schema', async () => {
      await handler.subscribe(COMPETITION_ID);
      const payload = Buffer.from(
        JSON.stringify({
          requestId: REQUEST_ID,
          method: 'unknown-method',
          params: {},
        }),
      );
      messageHandler(createRequestTopic(), payload);

      await vi.waitFor(() => {
        expect(mockMqttClient.publish).toHaveBeenCalledWith(
          createResponseTopic(),
          expect.stringContaining('"INVALID_REQUEST"'),
          { qos: 1, retain: false },
        );
      });
    });

    it('returns error response on QueryBus error', async () => {
      const error = new Error('Session not found');
      (error as any).code = 'SESSION_NOT_FOUND';
      vi.mocked(mockQueryBus.execute).mockRejectedValue(error);

      await handler.subscribe(COMPETITION_ID);
      const payload = Buffer.from(
        JSON.stringify({
          requestId: REQUEST_ID,
          method: 'get-score',
          params: { sessionId: SESSION_ID },
        }),
      );
      messageHandler(createRequestTopic(), payload);

      await vi.waitFor(() => {
        expect(mockMqttClient.publish).toHaveBeenCalledWith(
          createResponseTopic(),
          expect.stringContaining('"SESSION_NOT_FOUND"'),
          { qos: 1, retain: false },
        );
      });
    });

    it('ignores topics not targeted by RPC', async () => {
      await handler.subscribe(COMPETITION_ID);
      const payload = Buffer.from(
        JSON.stringify({
          requestId: REQUEST_ID,
          method: 'get-score',
          params: { sessionId: SESSION_ID },
        }),
      );

      // Unrelated topic
      messageHandler('saika/lane/some-lane/hardware/state', payload);

      // Verify publish is not called
      expect(mockMqttClient.publish).not.toHaveBeenCalled();
    });
  });
});
