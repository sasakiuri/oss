// SPDX-License-Identifier: MIT
/**
 * MQTT Competition State Schemas
 *
 * @description
 * Zod-based schemas for competition state payloads received via MQTT.
 * Used by CompetitionStateSubscriber to validate incoming messages.
 */

import { z } from 'zod';

// ============================================================
// Competition State Payload Schema
// ============================================================

/** Validation schema for CompetitionStatePayload published by the Director */
export const CompetitionStatePayloadSchema = z.object({
  competitionId: z.string(),
  competitionTypeId: z.string(),
  phase: z.string(),
  publishedAt: z.string(),
});

// ============================================================
// Type Exports
// ============================================================

export type CompetitionStatePayload = z.infer<typeof CompetitionStatePayloadSchema>;
