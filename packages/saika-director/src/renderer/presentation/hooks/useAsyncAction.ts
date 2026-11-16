import { useCallback, useState } from 'react';

import { errorMessage } from '@/renderer/services/serviceError';

export interface AsyncAction {
  readonly busy: boolean;
  readonly error: string | null;
  readonly setError: (error: string | null) => void;
  /**
   * Clears the error, marks the action busy and runs `work`. A thrown value becomes the error message
   * (`errorMessage(caught, fallback)`). Resolves `true` when `work` completed.
   */
  readonly run: (work: () => Promise<void>, fallback?: string) => Promise<boolean>;
}

/** Busy and error state for a panel's commands. */
export function useAsyncAction(): AsyncAction {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (work: () => Promise<void>, fallback?: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await work();
      return true;
    } catch (caught) {
      setError(errorMessage(caught, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, setError, run };
}
