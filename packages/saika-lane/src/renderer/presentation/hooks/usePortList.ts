// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useState } from 'react';

import type { SelectOption } from '@/renderer/presentation/components/common/Select';
import { connectionService } from '@/renderer/services/connectionService';
import type { PortInfo } from '@/shared/ipc/contracts';

/** Lists USB ports. Cancels updates from the initial request on unmount. */
export function usePortList() {
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [portOptions, setPortOptions] = useState<SelectOption[]>([]);
  const [isLoadingPorts, setIsLoadingPorts] = useState(true);
  const [portError, setPortError] = useState<string | null>(null);

  const fetchPorts = useCallback(async (signal?: AbortSignal) => {
    setIsLoadingPorts(true);
    setPortError(null);

    try {
      const { ports: nextPorts } = await connectionService.listPorts();
      if (signal?.aborted) return;

      setPorts(nextPorts);

      const options: SelectOption[] = nextPorts.map((port) => ({
        value: port.path,
        label: port.manufacturer ? `${port.path} (${port.manufacturer})` : port.path,
      }));
      setPortOptions(options);
    } catch (err) {
      if (signal?.aborted) return;
      setPorts([]);
      setPortOptions([]);
      setPortError(err instanceof Error ? err.message : 'Failed to fetch port list');
    } finally {
      if (signal?.aborted) return;
      setIsLoadingPorts(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchPorts(controller.signal);
    return () => controller.abort();
  }, [fetchPorts]);

  const refreshPorts = useCallback(() => {
    fetchPorts();
  }, [fetchPorts]);

  return { ports, portOptions, isLoadingPorts, portError, refreshPorts };
}
