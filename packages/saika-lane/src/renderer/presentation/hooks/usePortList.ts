// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { SelectOption } from '@/renderer/presentation/components/common/Select';
import { connectionService } from '@/renderer/services/connectionService';
import { errorMessage } from '@/shared/errors/errorMessage';
import type { PortInfo } from '@/shared/ipc/contracts';

/** Lists USB ports. Cancels updates from the initial request on unmount. */
export function usePortList() {
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [isLoadingPorts, setIsLoadingPorts] = useState(true);
  const [portError, setPortError] = useState<string | null>(null);

  const fetchPorts = useCallback(async (signal?: AbortSignal) => {
    setIsLoadingPorts(true);
    setPortError(null);

    try {
      const { ports: nextPorts } = await connectionService.listPorts();
      if (signal?.aborted) return;

      setPorts(nextPorts);
    } catch (err) {
      if (signal?.aborted) return;
      setPorts([]);
      setPortError(errorMessage(err, 'Failed to fetch port list'));
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

  const portOptions = useMemo<SelectOption[]>(
    () =>
      ports.map((port) => ({
        value: port.path,
        label: port.manufacturer ? `${port.path} (${port.manufacturer})` : port.path,
      })),
    [ports],
  );

  const refreshPorts = useCallback(() => {
    fetchPorts();
  }, [fetchPorts]);

  return { ports, portOptions, isLoadingPorts, portError, refreshPorts };
}
