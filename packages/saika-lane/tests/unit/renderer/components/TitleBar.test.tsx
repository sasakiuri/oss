// SPDX-License-Identifier: MIT
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TitleBar, type TitleBarProps } from '@/renderer/presentation/components/TitleBar';

// Mock windowService (used inside TitleBar for Toggle Fullscreen)
vi.mock('@/renderer/services/windowService', () => ({
  windowService: {
    toggleFullscreen: vi.fn().mockResolvedValue({ isFullscreen: false }),
  },
}));

// Mock useEscapeKey
vi.mock('@/renderer/presentation/hooks/useEscapeKey', () => ({
  useEscapeKey: vi.fn(),
}));

// ---------- helpers ----------

function defaultProps(overrides: Partial<TitleBarProps> = {}): TitleBarProps {
  return {
    isMaximized: false,
    onMinimize: vi.fn(),
    onMaximize: vi.fn(),
    onClose: vi.fn(),
    onSettingsOpen: vi.fn(),
    onDebugPanelToggle: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    ...overrides,
  };
}

// ---------- tests ----------

describe('TitleBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('basic rendering', () => {
    it('renders with the banner role', () => {
      render(<TitleBar {...defaultProps()} />);
      expect(screen.getByRole('banner')).toBeInTheDocument();
    });

    it('displays 5 menu items', () => {
      render(<TitleBar {...defaultProps()} />);
      const menubar = screen.getByRole('menubar');
      const menuItems = within(menubar).getAllByRole('menuitem');
      expect(menuItems).toHaveLength(5);
      expect(menuItems[0]).toHaveTextContent('File');
      expect(menuItems[1]).toHaveTextContent('Edit');
      expect(menuItems[2]).toHaveTextContent('View');
      expect(menuItems[3]).toHaveTextContent('Window');
      expect(menuItems[4]).toHaveTextContent('Help');
    });

    it('displays 3 window control buttons', () => {
      render(<TitleBar {...defaultProps()} />);
      expect(screen.getByLabelText('Minimize')).toBeInTheDocument();
      expect(screen.getByLabelText('Maximize')).toBeInTheDocument();
      expect(screen.getByLabelText('Close')).toBeInTheDocument();
    });

    it('displays the app title', () => {
      render(<TitleBar {...defaultProps()} />);
      expect(screen.getByText('Saika Lane')).toBeInTheDocument();
    });

    it('displays the Restore label when isMaximized=true', () => {
      render(<TitleBar {...defaultProps({ isMaximized: true })} />);
      expect(screen.getByLabelText('Restore')).toBeInTheDocument();
    });
  });

  describe('window controls', () => {
    it('calls onMinimize when the minimize button is clicked', async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<TitleBar {...props} />);

      await user.click(screen.getByLabelText('Minimize'));
      expect(props.onMinimize).toHaveBeenCalledTimes(1);
    });

    it('calls onMaximize when the maximize button is clicked', async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<TitleBar {...props} />);

      await user.click(screen.getByLabelText('Maximize'));
      expect(props.onMaximize).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when the close button is clicked', async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<TitleBar {...props} />);

      await user.click(screen.getByLabelText('Close'));
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('dropdown menu', () => {
    it('opens the dropdown when a menu is clicked', async () => {
      const user = userEvent.setup();
      render(<TitleBar {...defaultProps()} />);

      const menubar = screen.getByRole('menubar');
      const fileButton = within(menubar).getAllByRole('menuitem')[0]!;
      await user.click(fileButton);

      const dropdownMenu = screen.getByRole('menu');
      expect(dropdownMenu).toBeInTheDocument();
      expect(within(dropdownMenu).getByText('Settings...')).toBeInTheDocument();
      expect(within(dropdownMenu).getByText('Quit')).toBeInTheDocument();
    });

    it('closes the dropdown when the same menu is clicked again', async () => {
      const user = userEvent.setup();
      render(<TitleBar {...defaultProps()} />);

      const menubar = screen.getByRole('menubar');
      const fileButton = within(menubar).getAllByRole('menuitem')[0]!;
      await user.click(fileButton);
      expect(screen.getByRole('menu')).toBeInTheDocument();

      await user.click(fileButton);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('switches to another menu on hover while a menu is open', async () => {
      const user = userEvent.setup();
      render(<TitleBar {...defaultProps()} />);

      const menubar = screen.getByRole('menubar');
      const menuItems = within(menubar).getAllByRole('menuitem');

      // Open the File menu
      await user.click(menuItems[0]!);
      expect(screen.getByText('Settings...')).toBeInTheDocument();

      // Hover over Edit
      await user.hover(menuItems[1]!);
      expect(screen.getByText('Undo')).toBeInTheDocument();
      expect(screen.queryByText('Settings...')).not.toBeInTheDocument();
    });

    it('calls onSettingsOpen when Settings is clicked', async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<TitleBar {...props} />);

      // Open the File menu
      const menubar = screen.getByRole('menubar');
      await user.click(within(menubar).getAllByRole('menuitem')[0]!);

      // Click Settings...
      await user.click(screen.getByText('Settings...'));
      expect(props.onSettingsOpen).toHaveBeenCalledTimes(1);
    });

    it('closes the dropdown after a menu item is clicked', async () => {
      const user = userEvent.setup();
      render(<TitleBar {...defaultProps()} />);

      // Open the File menu
      const menubar = screen.getByRole('menubar');
      await user.click(within(menubar).getAllByRole('menuitem')[0]!);

      // Click Settings
      await user.click(screen.getByText('Settings...'));
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('displays keyboard shortcuts', async () => {
      const user = userEvent.setup();
      render(<TitleBar {...defaultProps()} />);

      const menubar = screen.getByRole('menubar');
      await user.click(within(menubar).getAllByRole('menuitem')[0]!);

      expect(screen.getByText('Ctrl+,')).toBeInTheDocument();
      expect(screen.getByText('Ctrl+Q')).toBeInTheDocument();
    });
  });
});
