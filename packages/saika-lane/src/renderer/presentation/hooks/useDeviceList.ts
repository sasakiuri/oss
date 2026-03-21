// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useRef, useState } from 'react';

import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import { connectionService } from '@/renderer/services/connectionService';
import type { Discipline, TargetDeviceDto, TargetManufacturer } from '@/shared/ipc/contracts';

/**
 * useDeviceList
 *
 * Sub-hook responsible for fetching and managing the device list for a given manufacturer.
 * Automatically re-fetches when the manufacturer changes.
 */
export function useDeviceList(manufacturer: TargetManufacturer) {
  const [deviceOptions, setDeviceOptions] = useState<TargetDeviceDto[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const { setDiscipline } = useSessionStore();
  const isInitialLoadRef = useRef(true);

  const fetchDevices = useCallback(
    async (mfr: TargetManufacturer, signal?: AbortSignal, preserveSelection = false) => {
      setIsLoadingDevices(true);
      setDeviceError(null);

      if (!preserveSelection) {
        setSelectedDeviceId('');
      }

      try {
        const { devices } = await connectionService.getDevicesByManufacturer({
          manufacturer: mfr,
        });
        if (signal?.aborted) return;

        setDeviceOptions(devices);

        if (devices.length === 1 && devices[0]) {
          const device = devices[0];
          setSelectedDeviceId(device.id);
          if (device.supportedDisciplines.length > 0) {
            const firstDiscipline = device.supportedDisciplines[0];
            if (firstDiscipline) {
              setDiscipline(firstDiscipline as Discipline);
            }
          }
        }
      } catch (err) {
        if (signal?.aborted) return;
        setDeviceError(err instanceof Error ? err.message : 'Failed to fetch device list');
        setDeviceOptions([]);
      } finally {
        if (signal?.aborted) return;
        setIsLoadingDevices(false);
      }
    },
    [setDiscipline],
  );

  // Auto re-fetch when manufacturer changes (skip initial load)
  useEffect(() => {
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      return;
    }

    const controller = new AbortController();
    fetchDevices(manufacturer, controller.signal, false);
    return () => controller.abort();
  }, [manufacturer, fetchDevices]);

  return {
    deviceOptions,
    selectedDeviceId,
    setSelectedDeviceId,
    isLoadingDevices,
    deviceError,
    fetchDevices,
    setDiscipline,
  };
}
