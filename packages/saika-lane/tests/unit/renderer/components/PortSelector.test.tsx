// SPDX-License-Identifier: MIT
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { SelectOption } from '@/renderer/presentation/components/common/Select';
import { PortSelector, type PortSelectorProps } from '@/renderer/presentation/components/PortSelector';

// ---------- helpers ----------

const SAMPLE_PORTS: SelectOption[] = [
  { value: '/dev/ttyUSB0', label: '/dev/ttyUSB0' },
  { value: '/dev/ttyUSB1', label: '/dev/ttyUSB1' },
];

function defaultProps(overrides: Partial<PortSelectorProps> = {}): PortSelectorProps {
  return {
    selectedPort: '',
    portOptions: SAMPLE_PORTS,
    isLoadingPorts: false,
    portError: null,
    onPortChange: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  };
}

// ---------- tests ----------

describe('PortSelector', () => {
  describe('basic rendering', () => {
    it('renders port options', () => {
      render(<PortSelector {...defaultProps()} />);

      expect(screen.getByText('/dev/ttyUSB0')).toBeInTheDocument();
      expect(screen.getByText('/dev/ttyUSB1')).toBeInTheDocument();
    });

    it('renders the Refresh button', () => {
      render(<PortSelector {...defaultProps()} />);

      expect(screen.getByRole('button', { name: 'Refresh port list' })).toBeInTheDocument();
    });

    it('displays the Serial Port label', () => {
      render(<PortSelector {...defaultProps()} />);

      expect(screen.getByText('Serial Port')).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('disables the select when isLoadingPorts=true', () => {
      render(<PortSelector {...defaultProps({ isLoadingPorts: true })} />);

      const select = screen.getByRole('combobox');
      expect(select).toBeDisabled();
    });

    it('disables the Refresh button when isLoadingPorts=true', () => {
      render(<PortSelector {...defaultProps({ isLoadingPorts: true })} />);

      expect(screen.getByRole('button', { name: 'Refresh port list' })).toBeDisabled();
    });

    it('shows "Loading..." placeholder when isLoadingPorts=true', () => {
      render(<PortSelector {...defaultProps({ isLoadingPorts: true, portOptions: [] })} />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  describe('empty port state', () => {
    it('disables the select when ports are empty', () => {
      render(<PortSelector {...defaultProps({ portOptions: [] })} />);

      const select = screen.getByRole('combobox');
      expect(select).toBeDisabled();
    });

    it('shows "No ports found" placeholder when ports are empty', () => {
      render(<PortSelector {...defaultProps({ portOptions: [] })} />);

      expect(screen.getByText('No ports found')).toBeInTheDocument();
    });
  });

  describe('error display', () => {
    it('displays the error message when portError is set', () => {
      render(<PortSelector {...defaultProps({ portError: 'Port access denied' })} />);

      expect(screen.getByRole('alert')).toHaveTextContent('Port access denied');
    });

    it('does not display an error message when portError is null', () => {
      render(<PortSelector {...defaultProps({ portError: null })} />);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('calls onRefresh when Refresh button is clicked', async () => {
      const user = userEvent.setup();
      const onRefresh = vi.fn();
      render(<PortSelector {...defaultProps({ onRefresh })} />);

      await user.click(screen.getByRole('button', { name: 'Refresh port list' }));

      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it('calls onPortChange when port selection changes', async () => {
      const user = userEvent.setup();
      const onPortChange = vi.fn();
      render(<PortSelector {...defaultProps({ onPortChange })} />);

      await user.selectOptions(screen.getByRole('combobox'), '/dev/ttyUSB1');

      expect(onPortChange).toHaveBeenCalledWith('/dev/ttyUSB1');
    });
  });
});
