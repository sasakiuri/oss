import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@/components/theme-provider';
import { ThemeSwitcher } from '@/components/theme-switcher';

const originalMatches = Element.prototype.matches;

beforeEach(() => {
  // jsdom's selector engine recurses for :modal, which Floating UI uses for positioning.
  vi.spyOn(Element.prototype, 'matches').mockImplementation(function (selector) {
    return selector === ':modal' ? false : originalMatches.call(this, selector);
  });
  localStorage.removeItem('knowledge-theme');
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.removeItem('knowledge-theme');
  document.documentElement.className = '';
  document.documentElement.style.colorScheme = '';
});

function renderSwitcher() {
  return render(
    <ThemeProvider>
      <ThemeSwitcher />
    </ThemeProvider>,
  );
}

it('lets keyboard users choose a theme, persists it, and restores focus after closing', async () => {
  renderSwitcher();
  const trigger = screen.getByRole('button', { name: '表示テーマを選ぶ' });
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  expect(await screen.findByRole('menuitemradio', { name: '端末の設定に合わせる' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'ダーク' }));
  await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
  expect(localStorage.getItem('knowledge-theme')).toBe('dark');
  await waitFor(() => expect(trigger).toHaveFocus());

  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('menuitemradio', { name: 'ライト' }));
  await waitFor(() => expect(document.documentElement).toHaveClass('light'));
  expect(localStorage.getItem('knowledge-theme')).toBe('light');

  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('menuitemradio', { name: '端末の設定に合わせる' }));
  expect(localStorage.getItem('knowledge-theme')).toBe('system');
  await waitFor(() => expect(document.documentElement).toHaveClass('light'));
});

it('restores a saved theme when the site mounts', async () => {
  localStorage.setItem('knowledge-theme', 'dark');
  renderSwitcher();
  await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
  fireEvent.keyDown(screen.getByRole('button', { name: '表示テーマを選ぶ' }), { key: 'ArrowDown' });
  expect(await screen.findByRole('menuitemradio', { name: 'ダーク' })).toHaveAttribute('aria-checked', 'true');
});
