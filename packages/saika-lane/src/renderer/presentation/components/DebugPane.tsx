// SPDX-License-Identifier: MIT
/**
 * DebugPane component
 *
 * @description
 * Debug log display pane component.
 * Displayed as a panel at the bottom of the screen, showing system-wide logs in real time.
 *
 * Features:
 * - List display of log entries (timestamp, level, source, message)
 * - Color coding by level (debug: muted, info: primary, warn: warning, error: error)
 * - Auto-scroll functionality
 * - Log clear functionality
 * - Entry count display
 * - Close button
 *
 * @example
 * ```tsx
 * <DebugPane
 *   onClose={() => setIsDebugPaneOpen(false)}
 *   className="h-64"
 * />
 * ```
 */

import React, { useEffect, useRef } from 'react';

import { Button } from '@/renderer/presentation/components/common/Button';
import { useLog } from '@/renderer/presentation/hooks/useLog';

import { LogEntry } from './debug/LogEntry';

/**
 * DebugPane component props
 */
export interface DebugPaneProps {
  /**
   * Callback when the close button is clicked
   */
  onClose: () => void;
  /** Optional CSS class name */
  className?: string;
}

/**
 * DebugPane component
 */
export const DebugPane: React.FC<DebugPaneProps> = ({ onClose, className = '' }) => {
  const { entries, autoScroll, clearEntries, setAutoScroll } = useLog();
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [entries, autoScroll]);

  return (
    <div className={`flex flex-col overflow-hidden border-t border-vscode-border bg-vscode-bg ${className}`.trim()}>
      {/* Header */}
      <header className="flex items-center justify-between border-b border-vscode-border bg-vscode-bg-light px-4 py-2">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-vscode-text">Debug Panel</h2>
          <span className="text-xs text-vscode-text-muted">{entries.length} entries</span>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-vscode-text">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="cursor-pointer"
              aria-label="Auto-scroll"
            />
            <span>Auto-scroll</span>
          </label>

          <Button variant="secondary" onClick={clearEntries} aria-label="Clear logs" className="px-2 py-1 text-xs">
            Clear
          </Button>

          <button
            onClick={onClose}
            className="text-vscode-text transition-colors hover:text-vscode-primary"
            aria-label="Close debug panel"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Log list */}
      <main className="flex-1 overflow-auto bg-vscode-bg p-3">
        {entries.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-vscode-text-muted">No log entries</p>
          </div>
        ) : (
          <div className="space-y-1 font-mono text-xs">
            {entries.map((entry) => (
              <LogEntry key={entry.id} entry={entry} />
            ))}
            <div ref={logEndRef} />
          </div>
        )}
      </main>
    </div>
  );
};
