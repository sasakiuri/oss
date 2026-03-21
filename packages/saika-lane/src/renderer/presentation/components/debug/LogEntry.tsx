// SPDX-License-Identifier: MIT
/**
 * LogEntry component
 *
 * @description
 * Display component for individual log entries.
 * Displays timestamp, log level, source, message, and metadata.
 */

import React from 'react';

import type { LogEntry as LogEntryType } from '@/shared/types/log';

import { LogLevelIndicator } from './LogLevelIndicator';

/**
 * Format timestamp to HH:mm:ss format
 */
function formatTimestamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Safely convert metadata to JSON string
 */
function formatMetadata(metadata: Record<string, unknown>): string {
  try {
    return JSON.stringify(metadata, null, 2);
  } catch (error) {
    return '[Metadata serialization failed: ' + (error instanceof Error ? error.message : 'Unknown error') + ']';
  }
}

/**
 * LogEntry component props
 */
interface LogEntryProps {
  /** Log entry data */
  entry: LogEntryType;
}

/**
 * Display of individual log entries
 */
export const LogEntry: React.FC<LogEntryProps> = ({ entry }) => (
  <div className="flex gap-2 rounded px-2 py-0.5 hover:bg-vscode-bg-light">
    {/* Timestamp */}
    <span className="w-16 flex-shrink-0 text-vscode-text-muted">{formatTimestamp(entry.timestamp)}</span>

    {/* Level */}
    <LogLevelIndicator level={entry.level} />

    {/* Source */}
    <span className="w-16 flex-shrink-0 text-vscode-text-muted">[{entry.source}]</span>

    {/* Message */}
    <span className="flex-1 break-words text-vscode-text">
      {entry.message}
      {entry.metadata && (
        <span className="mt-1 block whitespace-pre-wrap text-vscode-text-muted">{formatMetadata(entry.metadata)}</span>
      )}
    </span>
  </div>
);
