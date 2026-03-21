// SPDX-License-Identifier: MIT
/**
 * MQTT RPC Schemas
 *
 * @description
 * Zod-based schemas for MQTT RPC request/response payloads.
 * Covers shot list, score, and competition state queries.
 */

import { z } from 'zod';

// ============================================================
// RPC Request Schemas
// ============================================================

// --- Get shot list ---
export const GetShotListRequestSchema = z.object({
  requestId: z.string().uuid(),
  method: z.literal('get-shot-list'),
  params: z.object({
    sessionId: z.string().uuid(),
    stageIndex: z.number().int().min(0).optional(),
    seriesIndex: z.number().int().min(0).optional(),
    matchOnly: z.boolean().default(false),
  }),
});

// --- Get score ---
export const GetScoreRequestSchema = z.object({
  requestId: z.string().uuid(),
  method: z.literal('get-score'),
  params: z.object({
    sessionId: z.string().uuid(),
  }),
});

// --- Get competition state ---
export const GetCompetitionStateRequestSchema = z.object({
  requestId: z.string().uuid(),
  method: z.literal('get-competition-state'),
  params: z.object({}),
});

// --- Unified RPC request (discriminated union) ---
export const RpcRequestSchema = z.discriminatedUnion('method', [
  GetShotListRequestSchema,
  GetScoreRequestSchema,
  GetCompetitionStateRequestSchema,
]);

// ============================================================
// RPC Response Schemas
// ============================================================

// --- Common response ---
export const RpcSuccessResponseSchema = z.object({
  requestId: z.string().uuid(),
  method: z.string(),
  ok: z.literal(true),
  result: z.unknown(),
  respondedAt: z.string().datetime(),
});

export const RpcErrorResponseSchema = z.object({
  requestId: z.string().uuid(),
  method: z.string(),
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
  respondedAt: z.string().datetime(),
});

export const RpcResponseSchema = z.union([RpcSuccessResponseSchema, RpcErrorResponseSchema]);

// ============================================================
// Type Exports
// ============================================================

export type GetShotListRequest = z.infer<typeof GetShotListRequestSchema>;
export type GetScoreRequest = z.infer<typeof GetScoreRequestSchema>;
export type GetCompetitionStateRequest = z.infer<typeof GetCompetitionStateRequestSchema>;
export type RpcRequest = z.infer<typeof RpcRequestSchema>;
export type RpcResponse = z.infer<typeof RpcResponseSchema>;
