// SPDX-License-Identifier: MIT
import React from 'react';

import { Select, type SelectOption } from '@/renderer/presentation/components/common/Select';
import type { TargetDeviceDto } from '@/shared/ipc/contracts';

export interface DeviceSelectorProps {
  selectedManufacturer: string;
  selectedDeviceId: string;
  manufacturerOptions: SelectOption[];
  deviceOptions: TargetDeviceDto[];
  isLoadingDevices: boolean;
  deviceError: string | null;
  onManufacturerChange: (value: string) => void;
  onDeviceChange: (value: string) => void;
}

export const DeviceSelector: React.FC<DeviceSelectorProps> = ({
  selectedManufacturer,
  selectedDeviceId,
  manufacturerOptions,
  deviceOptions,
  isLoadingDevices,
  deviceError,
  onManufacturerChange,
  onDeviceChange,
}) => (
  <>
    <Select
      label="Target Manufacturer"
      value={selectedManufacturer}
      onChange={onManufacturerChange}
      options={manufacturerOptions}
    />

    <div className="flex flex-col gap-2">
      <Select
        label="Target Device"
        value={selectedDeviceId}
        onChange={onDeviceChange}
        options={deviceOptions.map((device) => ({
          value: device.id,
          label: device.displayName,
        }))}
        placeholder={
          isLoadingDevices ? 'Loading...' : deviceOptions.length === 0 ? 'No devices found' : 'Select a device'
        }
        disabled={isLoadingDevices || deviceOptions.length === 0}
      />
      {deviceError && (
        <div className="text-sm text-red-400" role="alert">
          {deviceError}
        </div>
      )}
    </div>
  </>
);
