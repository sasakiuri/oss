// SPDX-License-Identifier: MIT
/** Resolves once every promise continuation queued so far, and any it queues in turn, has run. */
export function flushPromises(): Promise<void> {
  return new Promise<void>((resolve) => setImmediate(resolve));
}
