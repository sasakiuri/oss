import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { SkipLink } from '@/components/skip-link';

describe('SkipLink', () => {
  it('moves keyboard focus to the main landmark', () => {
    render(
      <>
        <SkipLink />
        <main id="main-content" tabIndex={-1}>
          本文
        </main>
      </>,
    );
    fireEvent.click(screen.getByRole('link', { name: 'メインコンテンツへスキップ' }));
    expect(screen.getByRole('main')).toHaveFocus();
  });

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
