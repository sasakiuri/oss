import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '@/renderer/presentation/features/shared/common/Modal';

describe('Modal', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not render when isOpen is false', () => {
    const { container } = render(
      <Modal isOpen={false} onClose={mockOnClose} title="Test">
        Content
      </Modal>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('should render when isOpen is true', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose} title="Test Modal">
        Modal Content
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Test Modal')).toBeDefined();
    expect(screen.getByText('Modal Content')).toBeDefined();
  });

  it('should have aria-modal attribute', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose} title="Accessible">
        Content
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('should have aria-labelledby linking to title', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose} title="Labeled Modal">
        Content
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    const title = document.getElementById(labelId!);
    expect(title?.textContent).toBe('Labeled Modal');
  });

  it('should call onClose when close button is clicked', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose} title="Close Test">
        Content
      </Modal>,
    );
    const closeButton = screen.getByLabelText('Close modal');
    fireEvent.click(closeButton);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose when backdrop is clicked', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose} title="Backdrop Test">
        Content
      </Modal>,
    );
    // The backdrop is the first div inside the fixed container
    const backdrop = document.querySelector('[aria-hidden="true"]');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose on Escape key', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose} title="Escape Test">
        Content
      </Modal>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should render children', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose} title="Children Test">
        <div data-testid="child-content">Hello</div>
      </Modal>,
    );
    expect(screen.getByTestId('child-content')).toBeDefined();
  });

  it('should display title', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose} title="My Title">
        Content
      </Modal>,
    );
    expect(screen.getByText('My Title')).toBeDefined();
  });
});
