// SPDX-License-Identifier: MIT
/**
 * LogLevelIndicator component
 *
 * @description
 * Indicator display component for log levels.
 * Responsible for rendering coloring and badges according to log level.
 */

import React from 'react';

import type { LogLevel } from '@/shared/types/log';

/**
 * Get text color class based on log level
 */
function getLogLevelColorClass(level: LogLevel): string {
  switch (level) {
    case 'debug':
      return 'text-vscode-text-muted';
    case 'info':
      return 'text-vscode-primary';
    case 'warn':
      return 'text-vscode-warning';
    case 'error':
      return 'text-vscode-error';
    default:
      return 'text-vscode-text';
  }
}

/**
 * LogLevelIndicator component props
 */
interface LogLevelIndicatorProps {
  /** Log level */
  level: LogLevel;
}

/**
 * Log level indicator display
 */
export const LogLevelIndicator: React.FC<LogLevelIndicatorProps> = ({ level }) => (
  <span className={`${getLogLevelColorClass(level)} w-12 flex-shrink-0 font-semibold uppercase`}>{level}</span>
);
