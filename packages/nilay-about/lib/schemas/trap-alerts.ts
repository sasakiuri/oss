import { z } from 'zod';

import { HOOK_LABEL_MAX_LENGTH } from '@/lib/trap-alerts';

import { subscriptionRequestSchema } from './push';

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
/** The token in the URL a device calls; it can only raise an alert. */
export const triggerTokenSchema = tokenSchema;
/** The public id of a hook: the hash of its trigger token. */
export const hookIdSchema = tokenSchema;

export const createHookSchema = subscriptionRequestSchema.extend({
  label: z.string().trim().min(1).max(HOOK_LABEL_MAX_LENGTH),
});
export const manageHookSchema = z.object({ hookId: hookIdSchema, manageToken: tokenSchema });
export const addHookDeviceSchema = subscriptionRequestSchema.merge(manageHookSchema);

export const createdHookSchema = z.object({
  hookId: z.string(),
  triggerToken: z.string(),
  manageToken: z.string(),
  label: z.string(),
  expiresAt: z.string(),
});
export const addedHookDeviceSchema = z.object({ hookId: z.string(), label: z.string(), expiresAt: z.string() });
