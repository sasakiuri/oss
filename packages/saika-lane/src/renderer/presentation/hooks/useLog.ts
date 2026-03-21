// SPDX-License-Identifier: MIT
/**
 * Log management custom hook
 *
 * @description
 * Custom hook providing access to the log store and log message event subscriptions.
 * - Retrieve log entries
 * - Get auto-scroll setting
 * - Clear log action
 * - Toggle auto-scroll action
 * - Automatic subscription to the logMessage event
 *
 * @example
 * ```tsx
 * function LogViewer() {
 *   const {
 *     entries,
 *     autoScroll,
 *     clearEntries,
 *     setAutoScroll
 *   } = useLog();
 *
 *   return (
 *     <div>
 *       <button onClick={clearEntries}>Clear</button>
 *       <input
 *         type="checkbox"
 *         checked={autoScroll}
 *         onChange={(e) => setAutoScroll(e.target.checked)}
 *       />
 *       <div>
 *         {entries.map((entry) => (
 *           <div key={entry.id}>{entry.message}</div>
 *         ))}
 *       </div>
 *     </div>
 *   );
 * }
 * ```
 */

import { useLogStore } from '@/renderer/presentation/stores/logStore';
import type { LogEntry } from '@/shared/types/log';

/**
 * Return type of the useLog hook
 */
export interface UseLogResult {
  /** Array of log entries */
  entries: LogEntry[];
  /** Auto-scroll enabled flag */
  autoScroll: boolean;
  /** Clear log action */
  clearEntries: () => void;
  /** Change auto-scroll setting action */
  setAutoScroll: (autoScroll: boolean) => void;
}

/**
 * Log management custom hook
 *
 * @returns Log state and actions
 */
export function useLog(): UseLogResult {
  const { entries, autoScroll, clearEntries, setAutoScroll } = useLogStore();

  return {
    entries,
    autoScroll,
    clearEntries,
    setAutoScroll,
  };
}
