// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const settings = z.object({
  enabled: z.boolean(),
  port: z.number().int().min(1).max(65535),
  running: z.boolean(),
  endpoints: z.array(z.string()),
  sourceId: z.string(),
  pairingSecret: z.string(),
  error: z.string().nullable(),
});
export type VistaSettingsDto = z.infer<typeof settings>;
export const vistaContract = defineContract('vista', {
  getSettings: query(z.void(), queryResponseSchema(settings)),
  setSettings: command(
    z.object({ enabled: z.boolean(), port: z.number().int().min(1).max(65535) }),
    commandDataResponseSchema(settings),
  ),
});
