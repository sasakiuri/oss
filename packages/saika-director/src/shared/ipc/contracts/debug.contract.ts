import { z } from 'zod';
import { defineContract, query, queryResponseSchema } from '../defineContract';

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

const DebugLogEntrySchema = z.object({
  timestamp: z.number(),
  direction: z.enum(['TX', 'RX', 'LOG']),
  raw: z.string(),
  parsed: z.string().optional(),
});

const DebugLogResponseSchema = z.object({
  entries: z.array(DebugLogEntrySchema),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type DebugLogEntry = z.infer<typeof DebugLogEntrySchema>;
export type DebugLogResponse = z.infer<typeof DebugLogResponseSchema>;

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

export const debugContract = defineContract('debug', {
  getDebugLog: query(z.void(), queryResponseSchema(DebugLogResponseSchema), { channel: 'query:getDebugLog' }),
});
