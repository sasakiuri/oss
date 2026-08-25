import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/renderer/presentation/features/shared/common/Button';

describe('Button', () => {
  it('should render children text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeDefined();
  });

  it('should apply primary variant by default', () => {
    render(<Button>Primary</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-vscode-primary');
  });

  it('should apply secondary variant', () => {
    render(<Button variant="secondary">Secondary</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-vscode-bg-light');
  });

  it('should apply danger variant', () => {
    render(<Button variant="danger">Danger</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-vscode-error');
  });

  it('should apply md size by default', () => {
    render(<Button>Medium</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('min-h-9 px-3 py-1.5');
  });

  it('should apply sm size', () => {
    render(<Button size="sm">Small</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('min-h-8 px-2.5 py-1');
  });

  it('should apply lg size', () => {
    render(<Button size="lg">Large</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('min-h-10 px-4 py-2');
  });

  it('should handle click events', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('should be disabled when disabled prop is set', () => {
    render(<Button disabled>Disabled</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveProperty('disabled', true);
  });

  it('should apply custom className', () => {
    render(<Button className="custom-class">Custom</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('custom-class');
  });

  it('should pass through additional HTML attributes', () => {
    render(
      <Button type="submit" data-testid="test-btn">
        Submit
      </Button>,
    );
    const btn = screen.getByTestId('test-btn');
    expect(btn.getAttribute('type')).toBe('submit');
  });
});
