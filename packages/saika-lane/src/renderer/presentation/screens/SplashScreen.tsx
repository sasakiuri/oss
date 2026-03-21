// SPDX-License-Identifier: MIT
/**
 * SplashScreen component
 *
 * @description
 * Application splash screen displayed during initial loading.
 * Shows:
 * - Application logo/name
 * - Version information
 * - Loading indicator
 *
 * @example
 * ```tsx
 * <SplashScreen />
 * ```
 */

import React from 'react';

import appIcon from '@/assets/images/appIcon.png';

/**
 * SplashScreen component props
 */
export interface SplashScreenProps {
  /** Application version */
  version: string;
  /** Optional CSS class name */
  className?: string;
}

/**
 * SplashScreen component
 */
export const SplashScreen: React.FC<SplashScreenProps> = ({ version, className = '' }) => {
  return (
    <div className={`flex h-screen flex-col items-center justify-center bg-vscode-bg ${className}`.trim()}>
      {/* Application logo/name */}
      <div className="mb-8 flex flex-col items-center gap-6">
        <img src={appIcon} alt="Saika Lane" className="h-32 w-32" />
        <h1 className="text-6xl font-bold text-vscode-primary">SAIKA LANE</h1>
        <p className="text-lg text-vscode-text-muted">Electronic Target System</p>
      </div>

      {/* Loading indicator */}
      <div className="flex flex-col items-center gap-4">
        <div className="flex gap-2">
          <div className="h-3 w-3 animate-pulse rounded-full bg-vscode-primary" />
          <div className="h-3 w-3 animate-pulse rounded-full bg-vscode-primary" style={{ animationDelay: '0.2s' }} />
          <div className="h-3 w-3 animate-pulse rounded-full bg-vscode-primary" style={{ animationDelay: '0.4s' }} />
        </div>
        <p className="text-sm text-vscode-text-muted">Loading...</p>
      </div>

      {/* Version information */}
      <div className="absolute bottom-8">
        <p className="text-sm text-vscode-text-muted">Version {version}</p>
      </div>
    </div>
  );
};
