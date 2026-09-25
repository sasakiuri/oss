import { z } from 'zod';

import { createSavedStore } from '@/features/labs-notify/saved-store';
import { onSavedElsewhere, readStoredText, saveLockSupported, withSavedValue } from '@/lib/browser-storage';
import { labsWritable } from '@/lib/labs-session';
import { RETURN_WATCHERS_MAX } from '@/lib/return-alert';
import { returnPlanViewSchema } from '@/lib/schemas/return-alert';

export const RETURN_ALERT_STORAGE_KEY = 'nilay-labs-return-alert-v1';

/**
 * The plan this device made, with the credentials to end it. It is saved as soon as the server
 * answers the creation and only then armed; `armed` records whether arming has been confirmed, so
 * a page reloaded in between arms it again (arming is idempotent).
 */
const ownSchema = z.object({
  planId: z.string(),
  ownerToken: z.string(),
  watchToken: z.string(),
  plan: returnPlanViewSchema,
  armed: z.boolean(),
});
export type OwnPlan = z.infer<typeof ownSchema>;

const savedSchema = z.object({
  own: ownSchema.nullable(),
  /** Plans this device watches for someone else. */
  watching: z
    .array(z.object({ planId: z.string(), token: z.string(), plan: returnPlanViewSchema }))
    .max(RETURN_WATCHERS_MAX),
});
export type ReturnAlertSaved = z.infer<typeof savedSchema>;

/** The server deletes a plan a day after its last alert at the latest; its tokens and note go here too. */
const planGone = (plan: { returnAt: string; graceMinutes: number }, nowMs: number) =>
  Date.parse(plan.returnAt) + (plan.graceMinutes + 3 * 60 + 24 * 60) * 60_000 <= nowMs;

/**
 * Whether the browser's storage itself now holds these keys, read back rather than assumed: a
 * refused write still leaves them on the page, where a reload would lose them. A plan is armed only
 * after this, so an armed plan can always be ended from this browser.
 */
export function ownIsSaved(own: Pick<OwnPlan, 'planId' | 'ownerToken'>): boolean {
  const raw = readStoredText(RETURN_ALERT_STORAGE_KEY);
  if (raw === null || raw === 'unreadable') return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  const saved = z.object({ state: z.object({ value: z.object({ own: ownSchema.nullable() }) }) }).safeParse(parsed);
  const kept = saved.success ? saved.data.state.value.own : null;
  return kept?.planId === own.planId && kept.ownerToken === own.ownerToken;
}

export type Update = (change: (saved: ReturnAlertSaved) => ReturnAlertSaved) => ReturnAlertSaved;

/**
 * Runs `work` holding this tool's saved values alone among this browser's tabs (`withSavedValue`).
 * The values are read again from the storage first, and `update` applies a change to them as they
 * are now, so a tab holding an older state never saves it over another tab's plan and its keys.
 * Every change to the saved values goes through here.
 */
export function withSaved<T>(work: (saved: { update: Update }) => Promise<T>): Promise<T> {
  return withSavedValue(RETURN_ALERT_STORAGE_KEY, async () => {
    await useReturnAlertStore.persist.rehydrate();
    const update: Update = (change) => {
      const next = change(useReturnAlertStore.getState().value);
      useReturnAlertStore.getState().set(next);
      return next;
    };
    return work({ update });
  });
}

/**
 * Runs the making of this device's plan (create, save, arm) under the same lock, and only while no
 * plan is saved and the tools may save. The device keeps one plan; two creations at once would each
 * arm a plan, and the one whose keys were overwritten could no longer be ended. While a restore cut
 * short keeps the tools read-only, a plan's keys could not be kept, so none is made.
 */
export async function createAlone<T>(
  work: (saved: { update: Update }) => Promise<T>,
): Promise<{ ran: true; value: T } | { ran: false; reason: 'exists' | 'unsupported' | 'readOnly' }> {
  if (!saveLockSupported()) return { ran: false, reason: 'unsupported' };
  return withSaved(async (saved) => {
    if (!labsWritable()) return { ran: false as const, reason: 'readOnly' as const };
    if (useReturnAlertStore.getState().value.own) return { ran: false as const, reason: 'exists' as const };
    return { ran: true as const, value: await work(saved) };
  });
}

/** Takes in what another tab saves as soon as it is saved; returns the function that stops. */
export const followOtherTabs = () =>
  onSavedElsewhere(RETURN_ALERT_STORAGE_KEY, () => void useReturnAlertStore.persist.rehydrate());

export const useReturnAlertStore = createSavedStore<ReturnAlertSaved>(
  RETURN_ALERT_STORAGE_KEY,
  savedSchema,
  { own: null, watching: [] },
  (value, nowMs) => ({
    own: value.own && planGone(value.own.plan, nowMs) ? null : value.own,
    watching: value.watching.filter((item) => !planGone(item.plan, nowMs)),
  }),
  // Written back only under the lock (see `withSaved`), never on a plain read.
  { writeBackOnRead: false },
);
