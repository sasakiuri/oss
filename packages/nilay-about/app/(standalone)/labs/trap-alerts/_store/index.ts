import { z } from 'zod';

import { createSavedStore } from '@/features/labs-notify/saved-store';
import { hookIdSchema, triggerTokenSchema } from '@/lib/schemas/trap-alerts';

export const TRAP_ALERTS_STORAGE_KEY = 'nilay-labs-trap-alerts-v1';
export const SAVED_HOOKS_MAX = 20;

const hookSchema = z.object({
  hookId: hookIdSchema,
  triggerToken: triggerTokenSchema,
  manageToken: triggerTokenSchema,
  label: z.string(),
  expiresAt: z.string(),
});
export type SavedHook = z.infer<typeof hookSchema>;

const savedSchema = z.object({ hooks: z.array(hookSchema).max(SAVED_HOOKS_MAX) });
export type TrapAlertsSaved = z.infer<typeof savedSchema>;

/**
 * Hooks are not pruned by the saved expiry: calls to a hook extend it on the server without the
 * page knowing. The page asks the server on each visit and forgets a hook only when it is gone.
 */
export const useTrapAlertsStore = createSavedStore<TrapAlertsSaved>(TRAP_ALERTS_STORAGE_KEY, savedSchema, {
  hooks: [],
});
