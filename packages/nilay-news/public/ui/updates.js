// SPDX-License-Identifier: MIT

/** Synchronous view invalidation keeps controllers independent of DOM renderers.
 * Subscribe at bootstrap; imports alone never mount or start polling.
 */
const listeners = new Set();

export function onViewChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyView(scope = "all") {
  for (const listener of listeners) listener(scope);
}
