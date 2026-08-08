// SPDX-License-Identifier: MIT
/**
 * SettingsConnectionTab component
 *
 * @description
 * Connection tab component of the settings modal.
 * Manages connection and disconnection to USB target devices.
 * - Port selection
 * - Manufacturer and device selection
 * - Connect/Disconnect buttons
 * - Error display
 *
 * Directly uses useConnection / usePortList / useDeviceList.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { SelectOption } from '@/renderer/presentation/components/common/Select';
import { DeviceSelector } from '@/renderer/presentation/components/DeviceSelector';
import { PortSelector } from '@/renderer/presentation/components/PortSelector';
import { useConnection } from '@/renderer/presentation/hooks/useConnection';
import { useDeviceList } from '@/renderer/presentation/hooks/useDeviceList';
import { usePortList } from '@/renderer/presentation/hooks/usePortList';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import { settingsService } from '@/renderer/services/settingsService';
import type { ConnectionSettingsDto, Discipline, TargetManufacturer } from '@/shared/ipc/contracts';
import { resolveSavedConnectionPort } from '@/shared/settings/resolveSavedConnectionPort';

/**
 * Manufacturer options
 */
const MANUFACTURER_OPTIONS: SelectOption[] = [
  { value: 'KOHTO', label: 'Kohto Electronics' },
  { value: 'DISAG', label: 'DISAG' },
];

/**
 * SettingsConnectionTab component
 */
export const SettingsConnectionTab: React.FC = () => {
  const { status, connect, disconnect, isConnecting, isDisconnecting, error, clearError } = useConnection();

  const isConnected = status === 'connected';

  const [selectedPort, setSelectedPort] = useState('');
  const [selectedManufacturer, setSelectedManufacturer] = useState<TargetManufacturer>('KOHTO');
  const [savedConnectionSettings, setSavedConnectionSettings] = useState<ConnectionSettingsDto | null>(null);
  const [pendingSavedDeviceId, setPendingSavedDeviceId] = useState<string | null>(null);

  const { ports, portOptions, isLoadingPorts, portError, refreshPorts } = usePortList();

  const {
    deviceOptions,
    selectedDeviceId,
    setSelectedDeviceId,
    isLoadingDevices,
    deviceError,
    fetchDevices,
    setDiscipline,
  } = useDeviceList(selectedManufacturer);

  // Ref to capture current manufacturer for mount-only effect
  const selectedManufacturerRef = useRef(selectedManufacturer);
  selectedManufacturerRef.current = selectedManufacturer;
  const hasUserSelectedPortRef = useRef(false);

  // Mount effect: fetch device list and restore saved connection settings
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    (async () => {
      await fetchDevices(selectedManufacturerRef.current, signal, true);
      if (signal.aborted) return;

      try {
        const settings = await settingsService.getConnectionSettings();
        if (signal.aborted) return;

        setPendingSavedDeviceId(settings.deviceId ?? null);
        setSavedConnectionSettings(settings);
        if (settings.portName) {
          setSelectedPort(settings.portName);
        }
        if (MANUFACTURER_OPTIONS.some(({ value }) => value === settings.manufacturer)) {
          setSelectedManufacturer(settings.manufacturer);
        }
      } catch {
        // Settings restore failure is non-critical
      }
    })();

    return () => controller.abort();
  }, [fetchDevices, setSelectedPort, setSelectedManufacturer]);

  useEffect(() => {
    if (pendingSavedDeviceId === null || isLoadingDevices || deviceOptions.length === 0) {
      return;
    }

    const optionsMatchSelectedManufacturer = deviceOptions.every(
      (device) => device.manufacturer === selectedManufacturer,
    );
    if (!optionsMatchSelectedManufacturer) {
      return;
    }

    if (deviceOptions.some((device) => device.id === pendingSavedDeviceId)) {
      setSelectedDeviceId(pendingSavedDeviceId);
    }
    setPendingSavedDeviceId(null);
  }, [deviceOptions, isLoadingDevices, pendingSavedDeviceId, selectedManufacturer, setSelectedDeviceId]);

  useEffect(() => {
    if (hasUserSelectedPortRef.current || isLoadingPorts || !savedConnectionSettings?.portName) {
      return;
    }

    const resolvedPort = resolveSavedConnectionPort(savedConnectionSettings, ports);
    const nextPort = resolvedPort?.portName ?? savedConnectionSettings.portName;
    setSelectedPort((currentPort) => (currentPort === nextPort ? currentPort : nextPort));
  }, [isLoadingPorts, ports, savedConnectionSettings]);

  const handlePortChange = useCallback(
    (value: string) => {
      hasUserSelectedPortRef.current = true;
      setSelectedPort(value);
      clearError();
    },
    [clearError],
  );

  const handleManufacturerChange = useCallback(
    (value: string) => {
      setPendingSavedDeviceId(null);
      setSelectedManufacturer(value as TargetManufacturer);
      clearError();
    },
    [clearError],
  );

  const handleDeviceChange = useCallback(
    (value: string) => {
      setPendingSavedDeviceId(null);
      setSelectedDeviceId(value);
      const selectedDevice = deviceOptions.find((d) => d.id === value);
      if (selectedDevice && selectedDevice.supportedDisciplines.length > 0) {
        const firstDiscipline = selectedDevice.supportedDisciplines[0];
        if (firstDiscipline) {
          setDiscipline(firstDiscipline as Discipline);
        }
      }
      clearError();
    },
    [deviceOptions, setSelectedDeviceId, setDiscipline, clearError],
  );

  const handleConnect = useCallback(async () => {
    if (!selectedPort) return;

    const selectedDevice = deviceOptions.find((d) => d.id === selectedDeviceId);
    const selectedPortInfo = ports.find((port) => port.path === selectedPort);
    const baudRate = selectedDevice?.baudRate;

    await connect(selectedPort, selectedManufacturer, selectedDeviceId || undefined, baudRate);

    // Save connection settings
    try {
      await settingsService.saveConnectionSettings({
        portName: selectedPort,
        manufacturer: selectedManufacturer,
        deviceId: selectedDeviceId || undefined,
        serialNumber: selectedPortInfo?.serialNumber,
        vendorId: selectedPortInfo?.vendorId,
        productId: selectedPortInfo?.productId,
      });
    } catch {
      // Settings save failure is non-critical
    }

    // Save discipline to userPreferences
    const { discipline } = useSessionStore.getState();
    if (discipline) {
      try {
        await settingsService.saveUserPreferences({ discipline });
      } catch {
        // Save failure is non-critical
      }
    }
  }, [selectedPort, selectedManufacturer, selectedDeviceId, deviceOptions, ports, connect]);

  const handleDisconnect = useCallback(async () => {
    await disconnect();
  }, [disconnect]);

  const isRestoredSavedPort = selectedPort !== '' && savedConnectionSettings?.portName === selectedPort;
  const isSelectedPortAvailable =
    selectedPort !== '' &&
    (hasUserSelectedPortRef.current ||
      isLoadingPorts ||
      portError !== null ||
      isRestoredSavedPort ||
      ports.some((port) => port.path === selectedPort));
  const isConnectDisabled = !isSelectedPortAvailable || isConnecting || (deviceOptions.length > 1 && !selectedDeviceId);

  return (
    <div className="flex flex-col gap-4 p-4">
      <PortSelector
        selectedPort={selectedPort}
        portOptions={portOptions}
        isLoadingPorts={isLoadingPorts}
        portError={portError}
        onPortChange={handlePortChange}
        onRefresh={refreshPorts}
      />

      <DeviceSelector
        selectedManufacturer={selectedManufacturer}
        selectedDeviceId={selectedDeviceId}
        manufacturerOptions={MANUFACTURER_OPTIONS}
        deviceOptions={deviceOptions}
        isLoadingDevices={isLoadingDevices}
        deviceError={deviceError}
        onManufacturerChange={handleManufacturerChange}
        onDeviceChange={handleDeviceChange}
      />

      {error && (
        <div
          className="rounded-lg border border-red-500 bg-red-500/10 p-3 text-sm text-red-400"
          role="alert"
          aria-live="polite"
          aria-atomic="true"
        >
          {error}
        </div>
      )}

      <div className="mt-2 flex justify-end gap-3">
        {isConnected ? (
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={isDisconnecting}
            className="rounded bg-red-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleConnect}
            disabled={isConnectDisabled}
            className="rounded bg-blue-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isConnecting ? 'Connecting...' : 'Connect'}
          </button>
        )}
      </div>
    </div>
  );
};
