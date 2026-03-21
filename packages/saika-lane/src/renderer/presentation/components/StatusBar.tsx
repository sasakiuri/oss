// SPDX-License-Identifier: MIT
/**
 * StatusBar component
 *
 * @description
 * VSCode-style status bar component.
 * Displays time, connection status, and debug button.
 *
 * Layout:
 * ┌────────────────────────────────────────────┐
 * │ S1: HH:MM:SS            S2: WiFi  S3: Bug  │
 * └────────────────────────────────────────────┘
 *
 * @example
 * ```tsx
 * <StatusBar
 *   isConnected={true}
 *   onDebugPanelToggle={() => {}}
 * />
 * ```
 */

import { Bug, Wifi, WifiOff } from 'lucide-react';
import React, { useEffect, useState } from 'react';

/**
 * StatusBar component props
 */
export interface StatusBarProps {
  /**
   * Connection status
   */
  isConnected: boolean;
  /**
   * Debug panel toggle callback (only shown when provided)
   */
  onDebugPanelToggle?: () => void;
  /** Optional CSS class name */
  className?: string;
}

/**
 * StatusBar component
 */
export const StatusBar: React.FC<StatusBarProps> = ({ isConnected, onDebugPanelToggle, className = '' }) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Display time in HH:MM:SS format
  const timeString = currentTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  return (
    <footer
      className={`flex items-center justify-between border-t border-zinc-700 bg-zinc-900 px-4 py-3 ${className}`.trim()}
      role="contentinfo"
      aria-label="Status Bar"
    >
      {/* Left section - S1: Time */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm text-zinc-300">{timeString}</span>
      </div>

      {/* Right section - S2: Connection Status, S3: Debug Button */}
      <div className="flex items-center gap-3">
        {/* S2: Connection Status */}
        <div className="group relative flex items-center gap-1">
          {isConnected ? (
            <Wifi size={20} className="text-green-500" aria-label="Connected" />
          ) : (
            <WifiOff size={20} className="text-zinc-500" aria-label="Disconnected" />
          )}
          {/* Custom tooltip (shown above) */}
          <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-100 opacity-0 transition-opacity group-hover:opacity-100">
            {isConnected ? 'Target Device: Connected' : 'Target Device: Disconnected'}
            <div className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-transparent border-t-zinc-800"></div>
          </div>
        </div>

        {/* S3: Debug Button (dev only) */}
        {onDebugPanelToggle && (
          <button
            onClick={onDebugPanelToggle}
            className="group relative flex items-center gap-1 rounded px-2 py-0.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
            aria-label="Open Debug Panel"
          >
            <Bug size={20} />
            {/* Custom tooltip (shown above) */}
            <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-100 opacity-0 transition-opacity group-hover:opacity-100">
              Open Debug Panel
              <div className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-transparent border-t-zinc-800"></div>
            </div>
          </button>
        )}
      </div>
    </footer>
  );
};
