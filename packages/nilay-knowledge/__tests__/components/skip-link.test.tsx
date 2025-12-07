import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SkipLink } from '@/components/skip-link';

describe('SkipLink', () => {
  it('renders skip link with correct text', () => {
    render(<SkipLink />);
    const link = screen.getByRole('link', { name: 'メインコンテンツへスキップ' });
    expect(link).toBeInTheDocument();
  });

  it('links to #main-content', () => {
    render(<SkipLink />);
    const link = screen.getByRole('link', { name: 'メインコンテンツへスキップ' });
    expect(link).toHaveAttribute('href', '#main-content');
  });

  it('is visually hidden by default', () => {
    render(<SkipLink />);
    const link = screen.getByRole('link', { name: 'メインコンテンツへスキップ' });
    expect(link).toHaveClass('sr-only');
  });
});
