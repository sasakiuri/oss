// SPDX-License-Identifier: MIT
import type { AppUpdateStateDto } from '@sasakiuri/saika-updater';
import { useRef, useState } from 'react';
import { updaterService } from '@/renderer/services';
import { errorMessage, unwrap } from '@/renderer/services/serviceError';
import { useLiveSnapshot } from './useLiveSnapshot';

export function useAppUpdater() {
  const [state, setState] = useState<AppUpdateStateDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);

  useLiveSnapshot('appUpdateStateChanged', () => updaterService.getUpdateState(), {
    apply: (next, source) => {
      if (source === 'event') {
        // A pushed state outdates a check in flight and replaces the last error.
        revision.current += 1;
        setError(null);
      }
      setState(next);
    },
    onError: setError,
  });

  const checkForUpdates = async () => {
    setBusy(true);
    setError(null);
    const requestedRevision = revision.current;
    try {
      const checked = unwrap(await updaterService.checkForUpdates());
      if (revision.current === requestedRevision) setState(checked);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const quitAndInstall = async () => {
    setBusy(true);
    setError(null);
    try {
      unwrap(await updaterService.quitAndInstall(), 'Failed to install the update');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return { state, error, busy, checkForUpdates, quitAndInstall };
}
