// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import {
  GetCompetitionStateRequestSchema,
  GetScoreRequestSchema,
  GetShotListRequestSchema,
  RpcErrorResponseSchema,
  RpcRequestSchema,
  RpcResponseSchema,
  RpcSuccessResponseSchema,
} from '@/main/modules/mqtt/domain/MqttRpcSchemas';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_DATETIME = '2026-02-24T00:00:00Z';

describe('MqttRpcSchemas', () => {
  describe('GetShotListRequestSchema', () => {
    it('valid with all parameters specified', () => {
      const input = {
        requestId: VALID_UUID,
        method: 'get-shot-list' as const,
        params: {
          sessionId: VALID_UUID,
          stageIndex: 1,
          seriesIndex: 2,
          matchOnly: true,
        },
      };
      const result = GetShotListRequestSchema.parse(input);
      expect(result.method).toBe('get-shot-list');
      expect(result.params.matchOnly).toBe(true);
    });

    it('valid with optional parameters omitted (matchOnly defaults to false)', () => {
      const input = {
        requestId: VALID_UUID,
        method: 'get-shot-list' as const,
        params: { sessionId: VALID_UUID },
      };
      const result = GetShotListRequestSchema.parse(input);
      expect(result.params.matchOnly).toBe(false);
      expect(result.params.stageIndex).toBeUndefined();
      expect(result.params.seriesIndex).toBeUndefined();
    });

    it('fails when requestId is not a UUID', () => {
      const input = {
        requestId: 'not-a-uuid',
        method: 'get-shot-list' as const,
        params: { sessionId: VALID_UUID },
      };
      expect(() => GetShotListRequestSchema.parse(input)).toThrow();
    });

    it('fails when sessionId is not a UUID', () => {
      const input = {
        requestId: VALID_UUID,
        method: 'get-shot-list' as const,
        params: { sessionId: 'invalid' },
      };
      expect(() => GetShotListRequestSchema.parse(input)).toThrow();
    });

    it('fails when stageIndex is negative', () => {
      const input = {
        requestId: VALID_UUID,
        method: 'get-shot-list' as const,
        params: { sessionId: VALID_UUID, stageIndex: -1 },
      };
      expect(() => GetShotListRequestSchema.parse(input)).toThrow();
    });

    it('fails when seriesIndex is a decimal', () => {
      const input = {
        requestId: VALID_UUID,
        method: 'get-shot-list' as const,
        params: { sessionId: VALID_UUID, seriesIndex: 1.5 },
      };
      expect(() => GetShotListRequestSchema.parse(input)).toThrow();
    });
  });

  describe('GetScoreRequestSchema', () => {
    it('parses valid input', () => {
      const input = {
        requestId: VALID_UUID,
        method: 'get-score' as const,
        params: { sessionId: VALID_UUID },
      };
      const result = GetScoreRequestSchema.parse(input);
      expect(result.method).toBe('get-score');
      expect(result.params.sessionId).toBe(VALID_UUID);
    });

    it('fails when params is empty', () => {
      const input = {
        requestId: VALID_UUID,
        method: 'get-score' as const,
        params: {},
      };
      expect(() => GetScoreRequestSchema.parse(input)).toThrow();
    });
  });

  describe('GetCompetitionStateRequestSchema', () => {
    it('parses valid input', () => {
      const input = {
        requestId: VALID_UUID,
        method: 'get-competition-state' as const,
        params: {},
      };
      const result = GetCompetitionStateRequestSchema.parse(input);
      expect(result.method).toBe('get-competition-state');
    });

    it('fails when requestId is missing', () => {
      const input = {
        method: 'get-competition-state' as const,
        params: {},
      };
      expect(() => GetCompetitionStateRequestSchema.parse(input)).toThrow();
    });
  });

  describe('RpcRequestSchema (discriminated union)', () => {
    it('selects correct schema for get-shot-list method', () => {
      const input = {
        requestId: VALID_UUID,
        method: 'get-shot-list' as const,
        params: { sessionId: VALID_UUID },
      };
      const result = RpcRequestSchema.parse(input);
      expect(result.method).toBe('get-shot-list');
    });

    it('selects correct schema for get-score method', () => {
      const input = {
        requestId: VALID_UUID,
        method: 'get-score' as const,
        params: { sessionId: VALID_UUID },
      };
      const result = RpcRequestSchema.parse(input);
      expect(result.method).toBe('get-score');
    });

    it('selects correct schema for get-competition-state method', () => {
      const input = {
        requestId: VALID_UUID,
        method: 'get-competition-state' as const,
        params: {},
      };
      const result = RpcRequestSchema.parse(input);
      expect(result.method).toBe('get-competition-state');
    });

    it('fails for unknown method', () => {
      const input = {
        requestId: VALID_UUID,
        method: 'unknown-method',
        params: {},
      };
      expect(() => RpcRequestSchema.parse(input)).toThrow();
    });

    it('fails when method field is missing', () => {
      const input = {
        requestId: VALID_UUID,
        params: {},
      };
      expect(() => RpcRequestSchema.parse(input)).toThrow();
    });
  });

  describe('RpcSuccessResponseSchema', () => {
    it('parses valid success response', () => {
      const input = {
        requestId: VALID_UUID,
        method: 'get-score',
        ok: true as const,
        result: { totalScore: 100 },
        respondedAt: VALID_DATETIME,
      };
      const result = RpcSuccessResponseSchema.parse(input);
      expect(result.ok).toBe(true);
      expect(result.result).toEqual({ totalScore: 100 });
    });

    it('valid even when result is null', () => {
      const input = {
        requestId: VALID_UUID,
        method: 'get-score',
        ok: true as const,
        result: null,
        respondedAt: VALID_DATETIME,
      };
      const result = RpcSuccessResponseSchema.parse(input);
      expect(result.result).toBeNull();
    });

    it('should fail with ok: false', () => {
      const input = {
        requestId: VALID_UUID,
        method: 'get-score',
        ok: false,
        result: {},
        respondedAt: VALID_DATETIME,
      };
      expect(() => RpcSuccessResponseSchema.parse(input)).toThrow();
    });
  });

  describe('RpcErrorResponseSchema', () => {
    it('should parse a valid error response', () => {
      const input = {
        requestId: VALID_UUID,
        method: 'get-score',
        ok: false as const,
        error: { code: 'NOT_FOUND', message: 'Session not found' },
        respondedAt: VALID_DATETIME,
      };
      const result = RpcErrorResponseSchema.parse(input);
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should fail when error.code is missing', () => {
      const input = {
        requestId: VALID_UUID,
        method: 'get-score',
        ok: false as const,
        error: { message: 'error' },
        respondedAt: VALID_DATETIME,
      };
      expect(() => RpcErrorResponseSchema.parse(input)).toThrow();
    });

    it('should fail when error.message is missing', () => {
      const input = {
        requestId: VALID_UUID,
        method: 'get-score',
        ok: false as const,
        error: { code: 'ERR' },
        respondedAt: VALID_DATETIME,
      };
      expect(() => RpcErrorResponseSchema.parse(input)).toThrow();
    });
  });

  describe('RpcResponseSchema (union)', () => {
    it('should accept a success response', () => {
      const input = {
        requestId: VALID_UUID,
        method: 'get-score',
        ok: true as const,
        result: [],
        respondedAt: VALID_DATETIME,
      };
      const result = RpcResponseSchema.parse(input);
      expect(result.ok).toBe(true);
    });

    it('should accept an error response', () => {
      const input = {
        requestId: VALID_UUID,
        method: 'get-score',
        ok: false as const,
        error: { code: 'INTERNAL', message: 'Something went wrong' },
        respondedAt: VALID_DATETIME,
      };
      const result = RpcResponseSchema.parse(input);
      expect(result.ok).toBe(false);
    });

    it('should fail when respondedAt is an invalid datetime', () => {
      const input = {
        requestId: VALID_UUID,
        method: 'get-score',
        ok: true as const,
        result: {},
        respondedAt: 'not-a-datetime',
      };
      expect(() => RpcResponseSchema.parse(input)).toThrow();
    });
  });
});
