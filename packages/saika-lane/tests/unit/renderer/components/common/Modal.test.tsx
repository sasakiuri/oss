// SPDX-License-Identifier: MIT
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Modal } from '@/renderer/presentation/components/common/Modal';

describe('Modal', () => {
  let originalBodyOverflow: string;

  beforeEach(() => {
    // Save the body overflow style
    originalBodyOverflow = document.body.style.overflow;
  });

  afterEach(() => {
    // Restore the body overflow style
    document.body.style.overflow = originalBodyOverflow;
  });

  describe('basic rendering', () => {
    it('does not display the modal when isOpen is false', () => {
      render(
        <Modal isOpen={false} onClose={vi.fn()} title="Test Modal">
          <p>Modal content</p>
        </Modal>,
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('displays the modal when isOpen is true', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} title="Test Modal">
          <p>Modal content</p>
        </Modal>,
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('displays the title correctly', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} title="Test Title">
          <p>Content</p>
        </Modal>,
      );
      expect(screen.getByRole('heading', { name: 'Test Title' })).toBeInTheDocument();
    });

    it('displays children correctly', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} title="Modal">
          <p>Test content</p>
        </Modal>,
      );
      expect(screen.getByText('Test content')).toBeInTheDocument();
    });

    it('displays the close button', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} title="Modal">
          <p>Content</p>
        </Modal>,
      );
      expect(screen.getByRole('button', { name: 'Close modal' })).toBeInTheDocument();
    });
  });

  describe('close operations', () => {
    it('calls onClose when the close button is clicked', async () => {
      const handleClose = vi.fn();
      const user = userEvent.setup();

      render(
        <Modal isOpen={true} onClose={handleClose} title="Modal">
          <p>Content</p>
        </Modal>,
      );

      const closeButton = screen.getByRole('button', { name: 'Close modal' });
      await user.click(closeButton);

      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when the backdrop is clicked', async () => {
      const handleClose = vi.fn();
      const user = userEvent.setup();

      const { container } = render(
        <Modal isOpen={true} onClose={handleClose} title="Modal">
          <p>Content</p>
        </Modal>,
      );

      // The overlay is the outermost div (fixed layer)
      const overlay = container.firstChild as HTMLElement;
      await user.click(overlay);

      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClose when clicking inside the modal content', async () => {
      const handleClose = vi.fn();
      const user = userEvent.setup();

      render(
        <Modal isOpen={true} onClose={handleClose} title="Modal">
          <p>Content</p>
        </Modal>,
      );

      const content = screen.getByText('Content');
      await user.click(content);

      expect(handleClose).not.toHaveBeenCalled();
    });

    it('calls onClose when the ESC key is pressed', async () => {
      const handleClose = vi.fn();
      const user = userEvent.setup();

      render(
        <Modal isOpen={true} onClose={handleClose} title="Modal">
          <p>Content</p>
        </Modal>,
      );

      await user.keyboard('{Escape}');

      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClose for keys other than ESC', async () => {
      const handleClose = vi.fn();
      const user = userEvent.setup();

      render(
        <Modal isOpen={true} onClose={handleClose} title="Modal">
          <p>Content</p>
        </Modal>,
      );

      await user.keyboard('{Enter}');
      await user.keyboard('{Space}');
      await user.keyboard('a');

      expect(handleClose).not.toHaveBeenCalled();
    });
  });

  describe('focus management', () => {
    it('focuses the modal when it opens', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} title="Modal">
          <p>Content</p>
        </Modal>,
      );

      const dialog = screen.getByRole('dialog');
      // The inner container of the modal is focusable
      const modalContent = within(dialog).getByRole('heading').closest('div')?.parentElement;
      expect(modalContent).toHaveAttribute('tabindex', '-1');
    });

    it('can move focus within the modal using Tab key', async () => {
      const user = userEvent.setup();

      render(
        <Modal isOpen={true} onClose={vi.fn()} title="Modal">
          <button type="button">Button 1</button>
          <button type="button">Button 2</button>
        </Modal>,
      );

      const button1 = screen.getByRole('button', { name: 'Button 1' });
      const button2 = screen.getByRole('button', { name: 'Button 2' });

      // Focus the first element
      button1.focus();
      expect(button1).toHaveFocus();

      // Tab to the next element
      await user.tab();
      expect(button2).toHaveFocus();
    });

    it('focus trap: Tab from the last element returns to the first element', async () => {
      const user = userEvent.setup();

      render(
        <Modal isOpen={true} onClose={vi.fn()} title="Modal">
          <button type="button">First</button>
          <button type="button">Last</button>
        </Modal>,
      );

      const closeButton = screen.getByRole('button', { name: 'Close modal' });
      const lastButton = screen.getByRole('button', { name: 'Last' });
      const firstButton = screen.getByRole('button', { name: 'First' });

      // Focus the last focusable element
      lastButton.focus();
      expect(lastButton).toHaveFocus();

      // Pressing Tab wraps to the first element (circular)
      await user.tab();
      // Focus moves to either the close button or the first button
      const focusedElement = document.activeElement;
      expect([closeButton, firstButton]).toContain(focusedElement);
    });

    it('can move focus in reverse with Shift+Tab', async () => {
      const user = userEvent.setup();

      render(
        <Modal isOpen={true} onClose={vi.fn()} title="Modal">
          <button type="button">Button 1</button>
          <button type="button">Button 2</button>
        </Modal>,
      );

      const button2 = screen.getByRole('button', { name: 'Button 2' });

      // Focus Button 2
      button2.focus();
      expect(button2).toHaveFocus();

      // Shift+Tab to the previous element
      await user.keyboard('{Shift>}{Tab}{/Shift}');
      expect(screen.getByRole('button', { name: 'Button 1' })).toHaveFocus();
    });
  });

  describe('body scroll control', () => {
    it('sets body overflow to hidden when the modal is open', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} title="Modal">
          <p>Content</p>
        </Modal>,
      );

      expect(document.body.style.overflow).toBe('hidden');
    });

    it('restores body overflow when the modal is closed', () => {
      const { rerender } = render(
        <Modal isOpen={true} onClose={vi.fn()} title="Modal">
          <p>Content</p>
        </Modal>,
      );

      expect(document.body.style.overflow).toBe('hidden');

      rerender(
        <Modal isOpen={false} onClose={vi.fn()} title="Modal">
          <p>Content</p>
        </Modal>,
      );

      expect(document.body.style.overflow).toBe('');
    });
  });

  describe('accessibility', () => {
    it('has a dialog role', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} title="Modal">
          <p>Content</p>
        </Modal>,
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('has aria-modal="true" attribute', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} title="Modal">
          <p>Content</p>
        </Modal>,
      );
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });

    it('is associated with the title via aria-labelledby', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} title="Test Title">
          <p>Content</p>
        </Modal>,
      );

      const dialog = screen.getByRole('dialog');
      const heading = screen.getByRole('heading', { name: 'Test Title' });
      const headingId = heading.getAttribute('id');

      expect(dialog).toHaveAttribute('aria-labelledby', headingId);
    });

    it('close button has an aria-label', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} title="Modal">
          <p>Content</p>
        </Modal>,
      );

      const closeButton = screen.getByRole('button', { name: 'Close modal' });
      expect(closeButton).toHaveAttribute('aria-label', 'Close modal');
    });
  });

  describe('customization', () => {
    it('applies additional className', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} title="Modal" className="custom-class">
          <p>Content</p>
        </Modal>,
      );

      const dialog = screen.getByRole('dialog');
      const modalContent = within(dialog).getByRole('heading').closest('div')?.parentElement;
      expect(modalContent).toHaveClass('custom-class');
    });

    it('retains default style classes', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} title="Modal" className="custom-class">
          <p>Content</p>
        </Modal>,
      );

      const dialog = screen.getByRole('dialog');
      const modalContent = within(dialog).getByRole('heading').closest('div')?.parentElement;
      expect(modalContent).toHaveClass('bg-vscode-bg-light');
      expect(modalContent).toHaveClass('border');
    });
  });

  describe('edge cases', () => {
    it('does not error when children are empty', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} title="Empty Modal">
          {''}
        </Modal>,
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('handles multiple children elements', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} title="Modal">
          <p>First paragraph</p>
          <p>Second paragraph</p>
          <button type="button">Action</button>
        </Modal>,
      );

      expect(screen.getByText('First paragraph')).toBeInTheDocument();
      expect(screen.getByText('Second paragraph')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
    });

    it('works correctly when toggling isOpen', () => {
      const { rerender } = render(
        <Modal isOpen={false} onClose={vi.fn()} title="Modal">
          <p>Content</p>
        </Modal>,
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      rerender(
        <Modal isOpen={true} onClose={vi.fn()} title="Modal">
          <p>Content</p>
        </Modal>,
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();

      rerender(
        <Modal isOpen={false} onClose={vi.fn()} title="Modal">
          <p>Content</p>
        </Modal>,
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
