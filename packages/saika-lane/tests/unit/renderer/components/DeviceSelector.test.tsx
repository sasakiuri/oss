// SPDX-License-Identifier: MIT
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { SelectOption } from '@/renderer/presentation/components/common/Select';
import { DeviceSelector, type DeviceSelectorProps } from '@/renderer/presentation/components/DeviceSelector';
import type { TargetDeviceDto } from '@/shared/ipc/contracts';

// ---------- helpers ----------

const MANUFACTURER_OPTIONS: SelectOption[] = [
  { value: 'KOHTO', label: 'Kohto Electronics' },
  { value: 'SIUS', label: 'SIUS' },
];

const DEVICE_OPTIONS: TargetDeviceDto[] = [
  { id: 'mt201', manufacturer: 'KOHTO', displayName: 'MT201', baudRate: 9600, supportedDisciplines: ['AIR_RIFLE_10M'] },
  {
    id: 'bp216',
    manufacturer: 'KOHTO',
    displayName: 'BP216',
    baudRate: 9600,
    supportedDisciplines: ['AIR_PISTOL_10M'],
  },
];

function defaultProps(overrides: Partial<DeviceSelectorProps> = {}): DeviceSelectorProps {
  return {
    selectedManufacturer: '',
    selectedDeviceId: '',
    manufacturerOptions: MANUFACTURER_OPTIONS,
    deviceOptions: DEVICE_OPTIONS,
    isLoadingDevices: false,
    deviceError: null,
    onManufacturerChange: vi.fn(),
    onDeviceChange: vi.fn(),
    ...overrides,
  };
}

// ---------- tests ----------

describe('DeviceSelector', () => {
  describe('basic rendering', () => {
    it('displays the Target Manufacturer label', () => {
      render(<DeviceSelector {...defaultProps()} />);

      expect(screen.getByText('Target Manufacturer')).toBeInTheDocument();
    });

    it('displays the Target Device label', () => {
      render(<DeviceSelector {...defaultProps()} />);

      expect(screen.getByText('Target Device')).toBeInTheDocument();
    });

    it('renders manufacturer options', () => {
      render(<DeviceSelector {...defaultProps()} />);

      expect(screen.getByText('Kohto Electronics')).toBeInTheDocument();
      expect(screen.getByText('SIUS')).toBeInTheDocument();
    });

    it('renders device options', () => {
      render(<DeviceSelector {...defaultProps()} />);

      expect(screen.getByText('MT201')).toBeInTheDocument();
      expect(screen.getByText('BP216')).toBeInTheDocument();
    });
  });

  describe('manufacturer change', () => {
    it('calls onManufacturerChange when the manufacturer select changes', async () => {
      const user = userEvent.setup();
      const onManufacturerChange = vi.fn();
      render(<DeviceSelector {...defaultProps({ onManufacturerChange })} />);

      const selects = screen.getAllByRole('combobox');
      // First combobox is manufacturer
      await user.selectOptions(selects[0]!, 'SIUS');

      expect(onManufacturerChange).toHaveBeenCalledWith('SIUS');
    });
  });

  describe('device change', () => {
    it('calls onDeviceChange when the device select changes', async () => {
      const user = userEvent.setup();
      const onDeviceChange = vi.fn();
      render(<DeviceSelector {...defaultProps({ onDeviceChange })} />);

      const selects = screen.getAllByRole('combobox');
      // Second combobox is device
      await user.selectOptions(selects[1]!, 'bp216');

      expect(onDeviceChange).toHaveBeenCalledWith('bp216');
    });
  });

  describe('loading state', () => {
    it('disables the device select when isLoadingDevices=true', () => {
      render(<DeviceSelector {...defaultProps({ isLoadingDevices: true })} />);

      const selects = screen.getAllByRole('combobox');
      // Second combobox is device
      expect(selects[1]).toBeDisabled();
    });

    it('shows "Loading..." placeholder when isLoadingDevices=true', () => {
      render(<DeviceSelector {...defaultProps({ isLoadingDevices: true, deviceOptions: [] })} />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  describe('empty device state', () => {
    it('disables the select when devices are empty', () => {
      render(<DeviceSelector {...defaultProps({ deviceOptions: [] })} />);

      const selects = screen.getAllByRole('combobox');
      expect(selects[1]).toBeDisabled();
    });

    it('shows "No devices found" placeholder when devices are empty', () => {
      render(<DeviceSelector {...defaultProps({ deviceOptions: [] })} />);

      expect(screen.getByText('No devices found')).toBeInTheDocument();
    });
  });

  describe('error display', () => {
    it('displays the error message when deviceError is set', () => {
      render(<DeviceSelector {...defaultProps({ deviceError: 'Device not found' })} />);

      expect(screen.getByRole('alert')).toHaveTextContent('Device not found');
    });

    it('does not display an error message when deviceError is null', () => {
      render(<DeviceSelector {...defaultProps({ deviceError: null })} />);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
