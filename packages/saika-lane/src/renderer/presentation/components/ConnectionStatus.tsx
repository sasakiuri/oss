// SPDX-License-Identifier: MIT
/** Shows the connection status and connected manufacturer. */

import React from 'react';

import type { ConnectionStatus as ConnectionStatusType } from '@/shared/ipc/contracts';

export interface ConnectionStatusProps {
  /** Current connection status */
  status: ConnectionStatusType;
  /** Target manufacturer name (shown when connected) */
  manufacturer?: string | null;
  /** Optional CSS class name */
  className?: string;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ status, manufacturer, className = '' }) => {
  const isConnected = status === 'connected';

  /**
   * Get status indicator color
   */
  const getIndicatorColor = (): string => {
    return isConnected ? 'bg-vscode-success' : 'bg-vscode-error';
  };

  /**
   * Get status text
   */
  const getStatusText = (): string => {
    if (isConnected) {
      return manufacturer ? `Connected (${manufacturer})` : 'Connected';
    }
    return 'Disconnected';
  };

  /**
   * Get text color
   */
  const getTextColor = (): string => {
    return isConnected ? 'text-vscode-success' : 'text-vscode-text-muted';
  };

  return (
    <div
      className={`inline-flex items-center gap-2 rounded px-3 py-1.5 ${className}`.trim()}
      role="status"
      aria-label={`Connection Status: ${getStatusText()}`}
    >
      {/* Status indicator dot */}
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${getIndicatorColor()}`} aria-hidden="true" />

      {/* Status text */}
      <span className={`text-sm font-medium ${getTextColor()}`}>{getStatusText()}</span>
    </div>
  );
};
