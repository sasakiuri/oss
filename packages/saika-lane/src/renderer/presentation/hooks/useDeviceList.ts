// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useRef, useState } from 'react';

import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import { connectionService } from '@/renderer/services/connectionService';
import { errorMessage } from '@/shared/errors/errorMessage';
import type { TargetDeviceDto, TargetManufacturer } from '@/shared/ipc/contracts';

/** Switches the session to the device's first discipline when the current one is not supported. */
function applyDeviceDiscipline(device: TargetDeviceDto): void {
  const { discipline, setDiscipline } = useSessionStore.getState();
  if (!discipline || !device.supportedDisciplines.includes(discipline)) {
    const firstDiscipline = device.supportedDisciplines[0];
    if (firstDiscipline) {
      setDiscipline(firstDiscipline);
    }
  }
}

/**
 * useDeviceList
 *
 * Sub-hook responsible for fetching and managing the device list for a given manufacturer.
 * Automatically re-fetches when the manufacturer changes. Choosing a device, or a list with a single device,
 * also selects a discipline it supports.
 */
export function useDeviceList(manufacturer: TargetManufacturer) {
  const [deviceOptions, setDeviceOptions] = useState<TargetDeviceDto[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const isInitialLoadRef = useRef(true);

  const fetchDevices = useCallback(async (mfr: TargetManufacturer, signal?: AbortSignal, preserveSelection = false) => {
    setIsLoadingDevices(true);
    setDeviceError(null);
    setDeviceOptions([]);

    if (!preserveSelection) {
      setSelectedDeviceId('');
    }

    try {
      const { devices } = await connectionService.getDevicesByManufacturer({
        manufacturer: mfr,
      });
      if (signal?.aborted) return;

      setDeviceOptions(devices);
      setSelectedDeviceId((current) => (devices.some((device) => device.id === current) ? current : ''));

      if (devices.length === 1 && devices[0]) {
        setSelectedDeviceId(devices[0].id);
        applyDeviceDiscipline(devices[0]);
      }
    } catch (err) {
      if (signal?.aborted) return;
      setDeviceError(errorMessage(err, 'Failed to fetch device list'));
      setDeviceOptions([]);
    } finally {
      if (signal?.aborted) return;
      setIsLoadingDevices(false);
    }
  }, []);

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

  /** Selects the device chosen by the user. */
  const selectDevice = useCallback(
    (deviceId: string) => {
      setSelectedDeviceId(deviceId);
      const device = deviceOptions.find((option) => option.id === deviceId);
      if (device) applyDeviceDiscipline(device);
    },
    [deviceOptions],
  );

  return {
    deviceOptions,
    selectedDeviceId,
    setSelectedDeviceId,
    selectDevice,
    isLoadingDevices,
    deviceError,
    fetchDevices,
  };
}
