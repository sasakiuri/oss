// SPDX-License-Identifier: MIT
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ModeIndicator } from '@/renderer/presentation/components/ModeIndicator';
import type { SessionMode } from '@/shared/ipc/contracts';

describe('ModeIndicator', () => {
  describe('basic rendering', () => {
    it('SIGHTING mode is displayed correctly', () => {
      render(<ModeIndicator mode="SIGHTING" />);

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText('Sighting')).toBeInTheDocument();
    });

    it('MATCH mode is displayed correctly', () => {
      render(<ModeIndicator mode="MATCH" />);

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText('Match')).toBeInTheDocument();
    });

    it('displays the "Mode:" label', () => {
      render(<ModeIndicator mode="SIGHTING" />);

      expect(screen.getByText('Mode:')).toBeInTheDocument();
    });

    it('applies a custom className', () => {
      const { container } = render(<ModeIndicator mode="SIGHTING" className="custom-class" />);

      const element = container.firstChild as HTMLElement;
      expect(element).toHaveClass('custom-class');
    });
  });

  describe('coloring', () => {
    it('applies warning color (yellow) for SIGHTING mode', () => {
      const { container } = render(<ModeIndicator mode="SIGHTING" />);

      const badge = container.querySelector('.text-vscode-warning');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('bg-vscode-warning', 'bg-opacity-20');
    });

    it('applies error color (red) for MATCH mode', () => {
      const { container } = render(<ModeIndicator mode="MATCH" />);

      const badge = container.querySelector('.text-vscode-error');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('bg-vscode-error', 'bg-opacity-20');
    });
  });

  describe('badge style', () => {
    it('SIGHTING mode badge has the correct styles', () => {
      render(<ModeIndicator mode="SIGHTING" />);

      const badge = screen.getByText('Sighting');
      expect(badge).toHaveClass('inline-block', 'px-2', 'py-0.5', 'text-sm', 'font-bold', 'rounded');
    });

    it('MATCH mode badge has the correct styles', () => {
      render(<ModeIndicator mode="MATCH" />);

      const badge = screen.getByText('Match');
      expect(badge).toHaveClass('inline-block', 'px-2', 'py-0.5', 'text-sm', 'font-bold', 'rounded');
    });

    it('"Mode:" label has the correct styles', () => {
      render(<ModeIndicator mode="SIGHTING" />);

      const label = screen.getByText('Mode:');
      expect(label).toHaveClass('text-vscode-text-muted', 'text-sm', 'font-medium');
    });
  });

  describe('accessibility', () => {
    it('has a status role', () => {
      render(<ModeIndicator mode="SIGHTING" />);

      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('has the appropriate aria-label for SIGHTING mode', () => {
      render(<ModeIndicator mode="SIGHTING" />);

      expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Current Mode: Sighting');
    });

    it('has the appropriate aria-label for MATCH mode', () => {
      render(<ModeIndicator mode="MATCH" />);

      expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Current Mode: Match');
    });
  });

  describe('layout', () => {
    it('has basic layout classes', () => {
      const { container } = render(<ModeIndicator mode="SIGHTING" />);

      const element = container.firstChild as HTMLElement;
      expect(element).toHaveClass('inline-flex', 'items-center', 'gap-2', 'px-3', 'py-1.5', 'rounded');
    });

    it('label and badge are arranged horizontally', () => {
      const { container } = render(<ModeIndicator mode="SIGHTING" />);

      const element = container.firstChild as HTMLElement;
      expect(element).toHaveClass('inline-flex', 'items-center');
    });

    it('has appropriate gap between label and badge', () => {
      const { container } = render(<ModeIndicator mode="SIGHTING" />);

      const element = container.firstChild as HTMLElement;
      expect(element).toHaveClass('gap-2');
    });
  });

  describe('edge cases', () => {
    it('does not error with an invalid mode value (treated as MATCH)', () => {
      render(<ModeIndicator mode={'INVALID' as SessionMode} />);

      // isSighting becomes false, so it is treated as MATCH
      expect(screen.getByText('Match')).toBeInTheDocument();
    });

    it('does not error with an empty string (treated as MATCH)', () => {
      render(<ModeIndicator mode={'' as SessionMode} />);

      // isSighting becomes false, so it is treated as MATCH
      expect(screen.getByText('Match')).toBeInTheDocument();
    });
  });

  describe('visual differences', () => {
    it('SIGHTING and MATCH have different background colors', () => {
      const { container: sightingContainer } = render(<ModeIndicator mode="SIGHTING" />);
      const { container: matchContainer } = render(<ModeIndicator mode="MATCH" />);

      const sightingBadge = sightingContainer.querySelector('.bg-vscode-warning');
      const matchBadge = matchContainer.querySelector('.bg-vscode-error');

      expect(sightingBadge).toBeInTheDocument();
      expect(matchBadge).toBeInTheDocument();
    });

    it('SIGHTING and MATCH have different text colors', () => {
      const { container: sightingContainer } = render(<ModeIndicator mode="SIGHTING" />);
      const { container: matchContainer } = render(<ModeIndicator mode="MATCH" />);

      const sightingBadge = sightingContainer.querySelector('.text-vscode-warning');
      const matchBadge = matchContainer.querySelector('.text-vscode-error');

      expect(sightingBadge).toBeInTheDocument();
      expect(matchBadge).toBeInTheDocument();
    });
  });

  describe('mode switching', () => {
    it('updates display when switching from SIGHTING to MATCH', () => {
      const { rerender } = render(<ModeIndicator mode="SIGHTING" />);
      expect(screen.getByText('Sighting')).toBeInTheDocument();

      rerender(<ModeIndicator mode="MATCH" />);
      expect(screen.getByText('Match')).toBeInTheDocument();
      expect(screen.queryByText('Sighting')).not.toBeInTheDocument();
    });

    it('updates display when switching from MATCH to SIGHTING', () => {
      const { rerender } = render(<ModeIndicator mode="MATCH" />);
      expect(screen.getByText('Match')).toBeInTheDocument();

      rerender(<ModeIndicator mode="SIGHTING" />);
      expect(screen.getByText('Sighting')).toBeInTheDocument();
      expect(screen.queryByText('Match')).not.toBeInTheDocument();
    });
  });

  describe('text content', () => {
    it('displays "Sighting" for SIGHTING mode', () => {
      render(<ModeIndicator mode="SIGHTING" />);

      const badge = screen.getByText('Sighting');
      expect(badge).toBeInTheDocument();
    });

    it('displays "Match" for MATCH mode', () => {
      render(<ModeIndicator mode="MATCH" />);

      const badge = screen.getByText('Match');
      expect(badge).toBeInTheDocument();
    });

    it('label is "Mode:"', () => {
      render(<ModeIndicator mode="SIGHTING" />);

      expect(screen.getByText('Mode:')).toBeInTheDocument();
    });
  });
});
