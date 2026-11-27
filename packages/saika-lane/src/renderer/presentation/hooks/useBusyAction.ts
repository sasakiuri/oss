// SPDX-License-Identifier: MIT
import { useCallback, useState } from 'react';

import { errorMessage } from '@/shared/errors/errorMessage';

/**
 * Busy flag and error message for a panel's commands. `run` clears the error, marks the panel busy while `work`
 * runs and keeps the message of a failure instead of rejecting; use useAsyncAction when the caller needs the
 * rejection.
 */
export function useBusyAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (work: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, setError, run };
}
