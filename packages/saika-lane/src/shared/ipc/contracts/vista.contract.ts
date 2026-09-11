// SPDX-License-Identifier: MIT
import { z } from 'zod';

import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

export const LaneVistaStatusSchema = z.object({
  enabled: z.boolean(),
  sourceId: z.string(),
  secret: z.string(),
  endpoints: z.array(z.string()),
  error: z.string().nullable(),
});
export const vistaContract = defineContract('vista', {
  getStatus: query(queryResponseSchema(LaneVistaStatusSchema)),
  resetPairing: command(z.object({}), commandDataResponseSchema(LaneVistaStatusSchema)),
  setEnabled: command(z.object({ enabled: z.boolean() }), commandDataResponseSchema(LaneVistaStatusSchema)),
});
export type LaneVistaStatus = z.infer<typeof LaneVistaStatusSchema>;
