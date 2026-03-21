// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useState } from 'react';

import type { SelectOption } from '@/renderer/presentation/components/common/Select';
import { connectionService } from '@/renderer/services/connectionService';

/**
 * usePortList
 *
 * Sub-hook responsible for fetching and managing the USB port list.
 * Uses AbortController + signal.aborted guard pattern to prevent state updates after unmount.
 */
export function usePortList() {
  const [portOptions, setPortOptions] = useState<SelectOption[]>([]);
  const [isLoadingPorts, setIsLoadingPorts] = useState(true);
  const [portError, setPortError] = useState<string | null>(null);

  const fetchPorts = useCallback(async (signal?: AbortSignal) => {
    setIsLoadingPorts(true);
    setPortError(null);

    try {
      const { ports } = await connectionService.listPorts();
      if (signal?.aborted) return;

      const options: SelectOption[] = ports.map((port) => ({
        value: port.path,
        label: port.manufacturer ? `${port.path} (${port.manufacturer})` : port.path,
      }));
      setPortOptions(options);
    } catch (err) {
      if (signal?.aborted) return;
      setPortError(err instanceof Error ? err.message : 'Failed to fetch port list');
    } finally {
      if (signal?.aborted) return;
      setIsLoadingPorts(false);
    }
  }, []);

  // Auto-fetch on mount
  useEffect(() => {
    const controller = new AbortController();
    fetchPorts(controller.signal);
    return () => controller.abort();
  }, [fetchPorts]);

  // Externally callable refresh function (without signal)
  const refreshPorts = useCallback(() => {
    fetchPorts();
  }, [fetchPorts]);

  return { portOptions, isLoadingPorts, portError, refreshPorts };
}
