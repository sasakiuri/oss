// SPDX-License-Identifier: MIT
import { updateErrorSummary, type AppUpdateStateDto } from '@sasakiuri/saika-updater';
import { useEffect, useRef, useState } from 'react';

import type { UpdateBridge } from '../shared/updateBridge';

const labels: Record<AppUpdateStateDto['status'], string> = {
  unsupported: 'Updates are available in installed releases.',
  idle: 'Ready to check for updates.',
  checking: 'Checking for updates…',
  available: 'Update found. Starting download…',
  downloading: 'Downloading update…',
  downloaded: 'Update ready to install.',
  'no-update': 'Vista is up to date.',
  error: 'Update could not be completed.',
};

export function UpdateControls({ bridge = window.vistaUpdates }: { bridge?: UpdateBridge }) {
  const [state, setState] = useState<AppUpdateStateDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  useEffect(() => {
    let active = true;
    let receivedChange = false;
    const unsubscribe = bridge.onChange((next) => {
      receivedChange = true;
      revision.current += 1;
      if (active) setState(next);
    });
    void bridge.getState().then(
      (next) => {
        if (active && !receivedChange) setState(next);
      },
      (caught: unknown) => {
        if (active) setError(String(caught));
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [bridge]);
  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };
  const errorMessage = error || (state?.status === 'error' ? state.errorMessage : null);
  return (
    <section aria-label="Application updates" className="application-updates">
      <h3>Application updates</h3>
      {state && (
        <p className="field-help">
          Version {state.currentVersion}
          {state.targetVersion && ` · Update ${state.targetVersion}`}
        </p>
      )}
      <p role="status" className="field-help">
        {state
          ? state.status === 'unsupported'
            ? (state.errorMessage ?? labels.unsupported)
            : labels[state.status]
          : 'Reading update status…'}
      </p>
      {state?.status === 'downloading' && (
        <progress aria-label="Update download" max={100} value={state.downloadPercent ?? 0} />
      )}
      {errorMessage && (
        <div>
          <p role="alert" className="inline-error">
            {updateErrorSummary(errorMessage)}
          </p>
          {updateErrorSummary(errorMessage) !== errorMessage && (
            <details className="update-error-details">
              <summary>Technical details</summary>
              <pre>{errorMessage}</pre>
            </details>
          )}
        </div>
      )}
      <div className="inline-actions">
        <button
          className="secondary"
          disabled={busy || !state?.canCheckForUpdates}
          onClick={() =>
            void run(async () => {
              const requestedRevision = revision.current;
              const next = await bridge.check();
              if (revision.current === requestedRevision) setState(next);
            })
          }
        >
          Check for updates
        </button>
        {state?.canInstallUpdate && (
          <button disabled={busy} onClick={() => void run(() => bridge.install())}>
            Restart and install
          </button>
        )}
      </div>
      {state?.canInstallUpdate && (
        <p className="field-help">
          Restarting this PC’s Vista closes its audience windows and briefly disconnects its display PCs.
        </p>
      )}
    </section>
  );
}
