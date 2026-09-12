// SPDX-License-Identifier: MIT
import { updateErrorSummary, type AppUpdateStateDto } from '@sasakiuri/saika-updater';
import { useAppUpdater } from '@/renderer/presentation/hooks/useAppUpdater';
import { Button } from '../shared/common/Button';

function updateStatus(state: AppUpdateStateDto): string {
  switch (state.status) {
    case 'unsupported':
      return state.errorMessage ?? 'Updates are unavailable for this installation.';
    case 'checking':
      return 'Checking for updates…';
    case 'available':
      return 'Update available. Preparing download…';
    case 'downloading':
      return state.downloadPercent === null
        ? 'Downloading update…'
        : `Downloading update… ${Math.round(state.downloadPercent)}%`;
    case 'downloaded':
      return 'Update downloaded. Ready to install.';
    case 'no-update':
      return 'Saika Director is up to date.';
    case 'error':
      return 'The update could not be completed.';
    default:
      return 'Updates are checked when Saika Director starts.';
  }
}

export function AppUpdateSettingsPanel() {
  const { state, error, busy, checkForUpdates, quitAndInstall } = useAppUpdater();
  const errorMessage = error ?? (state?.status === 'error' ? state.errorMessage : null);
  return (
    <section aria-labelledby="app-update-heading" className="mt-6 border-t border-vscode-border">
      <div className="border-b border-vscode-border py-3">
        <h3 id="app-update-heading" className="text-sm font-semibold text-vscode-text">
          Application updates
        </h3>
      </div>
      <div className="grid gap-4 border-b border-vscode-border py-4 md:grid-cols-[15rem_minmax(0,1fr)]">
        <div>
          <h4 className="text-[13px] font-medium text-vscode-text">Saika Director</h4>
          <p className="mt-1 text-xs leading-5 text-vscode-text-muted">
            Current version: {state?.currentVersion ?? window.electronAPI.appVersion}
          </p>
        </div>
        <div className="max-w-xl space-y-3 text-xs">
          <p role="status">{state ? updateStatus(state) : 'Loading update status…'}</p>
          {state?.targetVersion && <p>Update version: {state.targetVersion}</p>}
          {errorMessage && (
            <div>
              <p role="alert" className="text-vscode-error">
                {updateErrorSummary(errorMessage)}
              </p>
              {updateErrorSummary(errorMessage) !== errorMessage && (
                <details className="mt-2 text-vscode-text-muted">
                  <summary className="cursor-pointer">Technical details</summary>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[11px]">
                    {errorMessage}
                  </pre>
                </details>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={busy || !state?.canCheckForUpdates}
              onClick={() => void checkForUpdates()}
            >
              Check for updates
            </Button>
            {state?.canInstallUpdate && (
              <Button variant="primary" size="sm" disabled={busy} onClick={() => void quitAndInstall()}>
                Restart and install
              </Button>
            )}
          </div>
          <p className="leading-5 text-vscode-text-muted">
            Restarting stops competition control and Lane connections, closes board windows, and disconnects Vista
            displays. Install only when competition operations have stopped safely.
          </p>
        </div>
      </div>
    </section>
  );
}
