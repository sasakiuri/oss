// SPDX-License-Identifier: MIT
import React from 'react';

import { Select, type SelectOption } from '@/renderer/presentation/components/common/Select';

export interface PortSelectorProps {
  selectedPort: string;
  portOptions: SelectOption[];
  isLoadingPorts: boolean;
  portError: string | null;
  onPortChange: (value: string) => void;
  onRefresh: () => void;
}

export const PortSelector: React.FC<PortSelectorProps> = ({
  selectedPort,
  portOptions,
  isLoadingPorts,
  portError,
  onPortChange,
  onRefresh,
}) => (
  <div className="flex flex-col gap-2">
    <div className="flex gap-2">
      <Select
        label="Serial Port"
        value={selectedPort}
        onChange={onPortChange}
        options={portOptions}
        placeholder={isLoadingPorts ? 'Loading...' : portOptions.length === 0 ? 'No ports found' : 'Select a port'}
        disabled={isLoadingPorts || portOptions.length === 0}
        className="flex-1"
      />
      <div className="flex flex-col justify-end">
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoadingPorts}
          className="rounded border border-vscode-border bg-vscode-bg-light p-2.5 text-vscode-text transition-colors hover:bg-vscode-bg-lighter disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Refresh port list"
        >
          <svg
            className={`h-5 w-5 ${isLoadingPorts ? 'animate-spin' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>
    </div>
    {portError && (
      <div className="text-sm text-red-400" role="alert">
        {portError}
      </div>
    )}
  </div>
);
