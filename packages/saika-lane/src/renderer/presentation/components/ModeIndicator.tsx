// SPDX-License-Identifier: MIT
/**
 * ModeIndicator component
 *
 * @description
 * Badge-style indicator showing current session mode (SIGHTING/MATCH).
 * Uses color coding to distinguish between modes:
 * - SIGHTING: Yellow/Warning color
 * - MATCH: Red/Error color (indicates recorded shots)
 *
 * @example
 * ```tsx
 * <ModeIndicator mode="MATCH" />
 * ```
 */

import React from 'react';

import type { SessionMode } from '@/shared/ipc/contracts';

/**
 * ModeIndicator component props
 */
export interface ModeIndicatorProps {
  /** Current session mode */
  mode: SessionMode;
  /** Optional CSS class name */
  className?: string;
}

/**
 * ModeIndicator component
 */
export const ModeIndicator: React.FC<ModeIndicatorProps> = ({ mode, className = '' }) => {
  const isSighting = mode === 'SIGHTING';

  return (
    <div
      className={`inline-flex items-center gap-2 rounded px-3 py-1.5 ${className}`.trim()}
      role="status"
      aria-label={`Current Mode: ${isSighting ? 'Sighting' : 'Match'}`}
    >
      <span className="text-sm font-medium text-vscode-text-muted">Mode:</span>
      <span
        className={`inline-block rounded px-2 py-0.5 text-sm font-bold ${
          isSighting
            ? 'bg-vscode-warning bg-opacity-20 text-vscode-warning'
            : 'bg-vscode-error bg-opacity-20 text-vscode-error'
        }`}
      >
        {isSighting ? 'Sighting' : 'Match'}
      </span>
    </div>
  );
};
