import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from '@/renderer/presentation/features/shared/common/Card';

describe('Card', () => {
  it('should render children', () => {
    render(
      <Card>
        <span data-testid="child">Hello</span>
      </Card>,
    );
    expect(screen.getByTestId('child')).toBeDefined();
    expect(screen.getByText('Hello')).toBeDefined();
  });

  it('should apply custom className', () => {
    const { container } = render(<Card className="custom-card">Custom</Card>);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('custom-card');
  });

  it('should render complex children', () => {
    render(
      <Card>
        <h2>Title</h2>
        <p>Description</p>
      </Card>,
    );
    expect(screen.getByText('Title')).toBeDefined();
    expect(screen.getByText('Description')).toBeDefined();
  });
});
