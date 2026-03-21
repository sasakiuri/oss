// SPDX-License-Identifier: MIT
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ConnectionStatus } from '@/renderer/presentation/components/ConnectionStatus';
import type { ConnectionStatus as ConnectionStatusType } from '@/shared/ipc/contracts';

describe('ConnectionStatus', () => {
  describe('basic rendering', () => {
    it('renders correctly in disconnected state', () => {
      render(<ConnectionStatus status="disconnected" />);

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText('Disconnected')).toBeInTheDocument();
    });

    it('renders correctly in connected state', () => {
      render(<ConnectionStatus status="connected" />);

      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    it('applies a custom className', () => {
      const { container } = render(<ConnectionStatus status="disconnected" className="custom-class" />);

      const statusElement = container.firstChild as HTMLElement;
      expect(statusElement).toHaveClass('custom-class');
    });
  });

  describe('manufacturer name display', () => {
    it('displays the manufacturer name when connected', () => {
      render(<ConnectionStatus status="connected" manufacturer="SIUS" />);

      expect(screen.getByText('Connected (SIUS)')).toBeInTheDocument();
    });

    it('displays the Meyton manufacturer', () => {
      render(<ConnectionStatus status="connected" manufacturer="Meyton" />);

      expect(screen.getByText('Connected (Meyton)')).toBeInTheDocument();
    });

    it('displays the DISAG manufacturer', () => {
      render(<ConnectionStatus status="connected" manufacturer="DISAG" />);

      expect(screen.getByText('Connected (DISAG)')).toBeInTheDocument();
    });

    it('does not display the manufacturer name in disconnected state', () => {
      render(<ConnectionStatus status="disconnected" manufacturer="SIUS" />);

      expect(screen.getByText('Disconnected')).toBeInTheDocument();
      expect(screen.queryByText('SIUS')).not.toBeInTheDocument();
    });

    it('displays without manufacturer name when manufacturer is null in connected state', () => {
      render(<ConnectionStatus status="connected" manufacturer={null} />);

      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    it('displays without manufacturer name when manufacturer is undefined in connected state', () => {
      render(<ConnectionStatus status="connected" manufacturer={undefined} />);

      expect(screen.getByText('Connected')).toBeInTheDocument();
    });
  });

  describe('status indicator', () => {
    it('displays a green indicator in connected state', () => {
      const { container } = render(<ConnectionStatus status="connected" />);

      const indicator = container.querySelector('.bg-vscode-success');
      expect(indicator).toBeInTheDocument();
      expect(indicator).toHaveClass('w-2.5', 'h-2.5', 'rounded-full');
    });

    it('displays a red indicator in disconnected state', () => {
      const { container } = render(<ConnectionStatus status="disconnected" />);

      const indicator = container.querySelector('.bg-vscode-error');
      expect(indicator).toBeInTheDocument();
      expect(indicator).toHaveClass('w-2.5', 'h-2.5', 'rounded-full');
    });
  });

  describe('text color', () => {
    it('displays text in success color when connected', () => {
      const { container } = render(<ConnectionStatus status="connected" />);

      const text = container.querySelector('.text-vscode-success');
      expect(text).toBeInTheDocument();
      expect(text).toHaveTextContent('Connected');
    });

    it('displays text in muted color when disconnected', () => {
      const { container } = render(<ConnectionStatus status="disconnected" />);

      const text = container.querySelector('.text-vscode-text-muted');
      expect(text).toBeInTheDocument();
      expect(text).toHaveTextContent('Disconnected');
    });
  });

  describe('accessibility', () => {
    it('has a status role', () => {
      render(<ConnectionStatus status="connected" />);

      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('has the appropriate aria-label in disconnected state', () => {
      render(<ConnectionStatus status="disconnected" />);

      expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Connection Status: Disconnected');
    });

    it('has the appropriate aria-label in connected state (without manufacturer)', () => {
      render(<ConnectionStatus status="connected" />);

      expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Connection Status: Connected');
    });

    it('has the appropriate aria-label in connected state (with manufacturer)', () => {
      render(<ConnectionStatus status="connected" manufacturer="SIUS" />);

      expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Connection Status: Connected (SIUS)');
    });

    it('indicator has aria-hidden attribute', () => {
      const { container } = render(<ConnectionStatus status="connected" />);

      const indicator = container.querySelector('.bg-vscode-success');
      expect(indicator).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('edge cases', () => {
    it('connecting state is not supported (treated as disconnected)', () => {
      render(<ConnectionStatus status={'connecting' as ConnectionStatusType} />);

      // In the implementation, anything other than 'connected' is treated as disconnected
      expect(screen.getByText('Disconnected')).toBeInTheDocument();
    });

    it('does not error with an empty manufacturer name string', () => {
      render(<ConnectionStatus status="connected" manufacturer={'' as any} />);

      // An empty string is treated as falsy, so the manufacturer name is not displayed
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    it('displays even with a very long manufacturer name', () => {
      const longName = 'VeryLongManufacturerNameThatShouldStillWork';
      render(<ConnectionStatus status="connected" manufacturer={longName as any} />);

      expect(screen.getByText(`Connected (${longName})`)).toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('has basic layout classes', () => {
      const { container } = render(<ConnectionStatus status="connected" />);

      const statusElement = container.firstChild as HTMLElement;
      expect(statusElement).toHaveClass('inline-flex', 'items-center', 'gap-2', 'px-3', 'py-1.5', 'rounded');
    });

    it('text has the appropriate font size and weight', () => {
      const { container } = render(<ConnectionStatus status="connected" />);

      const text = container.querySelector('.text-sm');
      expect(text).toHaveClass('font-medium');
    });
  });
});
