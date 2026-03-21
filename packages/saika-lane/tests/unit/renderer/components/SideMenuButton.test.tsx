// SPDX-License-Identifier: MIT
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SideMenuButton, type SideMenuButtonProps } from '@/renderer/presentation/components/SideMenuButton';

function defaultProps(overrides: Partial<SideMenuButtonProps> = {}): SideMenuButtonProps {
  return {
    icon: <span data-testid="icon">Icon</span>,
    label: 'Test Button',
    onClick: vi.fn(),
    ...overrides,
  };
}

describe('SideMenuButton', () => {
  describe('rendering', () => {
    it('should render a button with the correct aria-label', () => {
      render(<SideMenuButton {...defaultProps()} />);

      expect(screen.getByRole('button', { name: 'Test Button' })).toBeInTheDocument();
    });

    it('should render the icon', () => {
      render(<SideMenuButton {...defaultProps()} />);

      expect(screen.getByTestId('icon')).toBeInTheDocument();
    });

    it('should set title attribute', () => {
      render(<SideMenuButton {...defaultProps()} />);

      expect(screen.getByRole('button')).toHaveAttribute('title', 'Test Button');
    });

    it('should have type="button"', () => {
      render(<SideMenuButton {...defaultProps()} />);

      expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
    });
  });

  describe('click handling', () => {
    it('should call onClick when clicked', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(<SideMenuButton {...defaultProps({ onClick })} />);

      await user.click(screen.getByRole('button'));

      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('should not call onClick when disabled', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(<SideMenuButton {...defaultProps({ onClick, disabled: true })} />);

      await user.click(screen.getByRole('button'));

      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe('disabled state', () => {
    it('should be disabled when disabled prop is true', () => {
      render(<SideMenuButton {...defaultProps({ disabled: true })} />);

      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('should be enabled by default', () => {
      render(<SideMenuButton {...defaultProps()} />);

      expect(screen.getByRole('button')).toBeEnabled();
    });
  });

  describe('mode toggle (with activeColor)', () => {
    it('should set aria-pressed when activeColor is provided', () => {
      render(<SideMenuButton {...defaultProps({ activeColor: '#029863', active: true })} />);

      expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
    });

    it('should set aria-pressed=false when not active', () => {
      render(<SideMenuButton {...defaultProps({ activeColor: '#029863', active: false })} />);

      expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
    });

    it('should not have aria-pressed when no activeColor', () => {
      render(<SideMenuButton {...defaultProps()} />);

      expect(screen.getByRole('button')).not.toHaveAttribute('aria-pressed');
    });

    it('should apply background color style when active', () => {
      render(<SideMenuButton {...defaultProps({ activeColor: '#E54437', active: true })} />);

      expect(screen.getByRole('button')).toHaveStyle({ backgroundColor: '#E54437' });
    });

    it('should apply text color style when inactive', () => {
      render(<SideMenuButton {...defaultProps({ activeColor: '#029863', active: false })} />);

      expect(screen.getByRole('button')).toHaveStyle({ color: '#029863' });
    });

    it('should apply disabled styling when disabled with activeColor', () => {
      render(<SideMenuButton {...defaultProps({ activeColor: '#029863', active: true, disabled: true })} />);

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(button).toHaveClass('cursor-not-allowed');
    });
  });
});
