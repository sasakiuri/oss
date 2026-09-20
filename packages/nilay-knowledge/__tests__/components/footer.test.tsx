import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Footer } from '@/components/footer';

afterEach(() => vi.restoreAllMocks());

describe('Footer accessibility', () => {
  it.each([
    { reducedMotion: false, behavior: 'smooth' },
    { reducedMotion: true, behavior: 'instant' },
  ])('moves focus to the page start with reduced motion $reducedMotion', ({ reducedMotion, behavior }) => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: reducedMotion } as MediaQueryList);
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(
      <>
        <header id="site-header" tabIndex={-1} aria-label="サイトヘッダー" />
        <Footer publishYear={2026} />
      </>,
    );
    const top = screen.getByRole('button', { name: 'トップへ戻る' });
    top.focus();
    fireEvent.click(top);
    expect(screen.getByRole('banner', { name: 'サイトヘッダー' })).toHaveFocus();
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior });
    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });

  it('gives the footer navigation and social links distinct accessible names', () => {
    render(<Footer publishYear={2026} />);
    expect(screen.getByRole('navigation', { name: 'フッターナビゲーション' })).toBeInTheDocument();
    const socialLinks = within(screen.getByRole('navigation', { name: 'ソーシャルメディア' })).getAllByRole('link');
    expect(socialLinks).toHaveLength(6);
    for (const link of socialLinks) {
      expect(link).toHaveAccessibleName();
      expect(link).not.toHaveAttribute('target');
    }
  });
});
