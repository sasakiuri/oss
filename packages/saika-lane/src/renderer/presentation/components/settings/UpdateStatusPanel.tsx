// SPDX-License-Identifier: MIT
import { updateErrorSummary } from '@sasakiuri/saika-updater';

import { useUpdateStore } from '@/renderer/presentation/stores/updateStore';
import { updateService } from '@/renderer/services/updateService';
import { errorMessage } from '@/shared/errors/errorMessage';
import type { AppUpdateStateDto } from '@/shared/ipc/contracts';

function formatUpdateTimestamp(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function formatByteCount(value: number | null): string | null {
  if (value == null) {
    return null;
  }

  if (value < 1024) {
    return `${Math.round(value)} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function describeUpdateState(state: AppUpdateStateDto, fallbackVersion: string): string {
  switch (state.status) {
    case 'unsupported':
      return state.errorMessage ?? 'Auto-update is unavailable in this environment.';
    case 'idle':
      return `Saika Lane ${state.currentVersion || fallbackVersion} is ready to check for updates.`;
    case 'checking':
      return 'Checking GitHub Releases for a newer version...';
    case 'available':
      return `Version ${state.targetVersion ?? 'unknown'} is available. Downloading will start automatically.`;
    case 'downloading':
      return `Downloading version ${state.targetVersion ?? 'unknown'}...`;
    case 'downloaded':
      return `Version ${state.targetVersion ?? 'unknown'} has been downloaded and is ready to install.`;
    case 'no-update':
      return `You are already on the latest version (${state.currentVersion || fallbackVersion}).`;
    case 'error':
      return 'The update could not be completed.';
    default:
      return 'Update status is unavailable.';
  }
}

/**
 * Application update status with the check and install actions. The dialog keeps the action error so that it
 * survives tab switches and clears it when it opens or the update state changes.
 */
export function UpdateStatusPanel({
  actionError,
  onActionError,
}: {
  actionError: string | null;
  onActionError: (message: string | null) => void;
}) {
  const updateState = useUpdateStore((state) => state);

  const handleCheckForUpdates = async () => {
    try {
      onActionError(null);
      await updateService.checkForUpdates();
    } catch (err) {
      onActionError(errorMessage(err));
    }
  };

  const handleQuitAndInstall = async () => {
    try {
      onActionError(null);
      await updateService.quitAndInstall();
    } catch (err) {
      onActionError(errorMessage(err));
    }
  };

  const displayedVersion = updateState.currentVersion || window.electronAPI.appVersion;
  const formattedLastChecked = formatUpdateTimestamp(updateState.lastCheckedAt);
  const formattedTransferred = formatByteCount(updateState.transferredBytes);
  const formattedTotal = formatByteCount(updateState.totalBytes);
  const visibleUpdateError = actionError ?? (updateState.status === 'error' ? updateState.errorMessage : null);
  const updateErrorText = visibleUpdateError === null ? null : updateErrorSummary(visibleUpdateError);

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-200">Application Update</p>
          <p className="mt-1 text-xs text-zinc-400">Current Version: {displayedVersion}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCheckForUpdates}
            disabled={!updateState.canCheckForUpdates}
            className="rounded bg-zinc-700 px-3 py-2 text-sm text-zinc-100 transition-colors enabled:hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Check for Updates
          </button>

          {updateState.canInstallUpdate && (
            <button
              type="button"
              onClick={handleQuitAndInstall}
              className="rounded bg-emerald-600 px-3 py-2 text-sm text-white transition-colors hover:bg-emerald-500"
            >
              Restart &amp; Install
            </button>
          )}
        </div>
      </div>

      <p className="mt-3 text-sm text-zinc-300">{describeUpdateState(updateState, window.electronAPI.appVersion)}</p>

      {updateState.targetVersion && (
        <p className="mt-2 text-xs text-zinc-400">
          Target Version: {updateState.targetVersion}
          {updateState.releaseName ? ` (${updateState.releaseName})` : ''}
        </p>
      )}

      {updateState.downloadPercent !== null && (
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full bg-blue-500 transition-[width]"
              style={{ width: `${Math.max(0, Math.min(100, updateState.downloadPercent))}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            {updateState.downloadPercent.toFixed(1)}%
            {formattedTransferred && formattedTotal ? ` (${formattedTransferred} / ${formattedTotal})` : ''}
          </p>
        </div>
      )}

      {formattedLastChecked && <p className="mt-2 text-xs text-zinc-500">Last Checked: {formattedLastChecked}</p>}

      {updateState.releaseNotes && (
        <div className="mt-3 rounded border border-zinc-700 bg-zinc-950/70 p-3">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Release Notes</p>
          <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-xs text-zinc-300">
            {updateState.releaseNotes}
          </pre>
        </div>
      )}

      {visibleUpdateError && (
        <>
          <div
            className="mt-3 rounded border border-red-500/60 bg-red-500/10 p-3 text-sm text-red-300"
            role="alert"
            aria-live="polite"
            aria-atomic="true"
          >
            {updateErrorText}
          </div>
          {updateErrorText !== visibleUpdateError && (
            <details className="mt-2 text-xs text-zinc-400">
              <summary className="cursor-pointer">Technical details</summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all">{visibleUpdateError}</pre>
            </details>
          )}
        </>
      )}
    </div>
  );
}
