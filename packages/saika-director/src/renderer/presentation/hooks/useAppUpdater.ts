// SPDX-License-Identifier: MIT
import type { AppUpdateStateDto } from '@sasakiuri/saika-updater';
import { useEffect, useRef, useState } from 'react';
import { useEventBus } from '@/renderer/events/EventBusProvider';
import { updaterService } from '@/renderer/services';

export function useAppUpdater() {
  const bus = useEventBus();
  const [state, setState] = useState<AppUpdateStateDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);

  useEffect(() => {
    let disposed = false;
    const unsubscribe = bus.subscribe('appUpdateStateChanged', (next) => {
      revision.current += 1;
      setState(next);
      setError(null);
    });
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
      unsubscribe();
    };
  }, [bus]);

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
