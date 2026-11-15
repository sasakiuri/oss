// SPDX-License-Identifier: MIT
import type { AppUpdateStateDto } from '@sasakiuri/saika-updater';
import { useEffect, useRef, useState } from 'react';
import { updaterService } from '@/renderer/services';
import { useEvent } from './useEvent';

export function useAppUpdater() {
  const [state, setState] = useState<AppUpdateStateDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);

  useEvent('appUpdateStateChanged', (next) => {
    revision.current += 1;
    setState(next);
    setError(null);
  });

  useEffect(() => {
    let disposed = false;
    const requestedRevision = revision.current;
    void updaterService.getUpdateState().then(
      (response) => {
        if (disposed || revision.current !== requestedRevision) return;
        if (response.success) setState(response.data);
        else setError(response.error.message);
      },
      (caught: unknown) => {
        if (!disposed) setError(caught instanceof Error ? caught.message : String(caught));
      },
    );
    return () => {
      disposed = true;
    };
  }, []);

  const checkForUpdates = async () => {
    setBusy(true);
    setError(null);
    const requestedRevision = revision.current;
    try {
      const response = await updaterService.checkForUpdates();
      if (!response.success) throw new Error(response.error.message);
      if (revision.current === requestedRevision) setState(response.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const quitAndInstall = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await updaterService.quitAndInstall();
      if (!response.success) throw new Error(response.error?.message ?? 'Failed to install the update');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return { state, error, busy, checkForUpdates, quitAndInstall };
}
