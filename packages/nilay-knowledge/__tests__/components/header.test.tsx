import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Header } from '@/components/header';

vi.mock('next/navigation', () => ({ usePathname: () => '/articles/1597956932/' }));
vi.mock('@/components/search-dialog', () => ({ SearchDialog: () => <button>記事・ニュースを検索</button> }));
vi.mock('@/components/theme-switcher', () => ({ ThemeSwitcher: () => <button>テーマ</button> }));
vi.mock('next/link', () => ({
  default: ({ href, children, onClick, ...props }: ComponentProps<'a'>) => (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
    >
      {children}
    </a>
  ),
}));

describe('Header accessibility', () => {
  it('names navigation and the shopping link even when its visible text is hidden on mobile', () => {
    render(<Header />);
    expect(screen.getByRole('navigation', { name: 'メインナビゲーション' })).toBeInTheDocument();
    const shopping = screen.getByRole('link', { name: 'Shopping（通信販売）' });
    expect(shopping).toHaveAttribute('aria-label', 'Shopping（通信販売）');
    expect(shopping).not.toHaveAttribute('target');
  });

  it('marks only the exact current page, including paths with a trailing slash', () => {
    render(<Header />);
    expect(screen.getByRole('link', { name: '申請書類' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '記事一覧' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: '案内所' })).not.toHaveAttribute('aria-current');
  });

  it('focuses the mobile dialog and restores the menu button on Escape', async () => {
    render(<Header />);
    const trigger = screen.getByRole('button', { name: 'メニューを開く' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'ナビゲーションメニュー' });
    const close = within(dialog).getByRole('button', { name: 'メニューを閉じる' });
    expect(close).toHaveFocus();
    expect(dialog).toHaveClass('overflow-y-auto');
    expect(within(dialog).getByRole('link', { name: '申請書類' })).toHaveAttribute('aria-current', 'page');

    fireEvent.keyDown(close, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('closes the mobile dialog after a navigation link is chosen', async () => {
    render(<Header />);
    fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('link', { name: '案内所' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
