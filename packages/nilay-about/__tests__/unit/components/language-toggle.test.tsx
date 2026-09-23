import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { LanguageBoundary } from '@/components/language-boundary';
import { LanguageToggle } from '@/components/layout';
import { languageStorageKey, useLanguageStore } from '@/store';

describe('choosing the language the site is read in', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'ja' });
    window.localStorage.clear();
    document.documentElement.lang = 'ja';
  });

  it('offers both, each named in its own language', () => {
    render(<LanguageToggle />);
    const japanese = screen.getByRole('button', { name: '日本語' });
    const english = screen.getByRole('button', { name: 'English' });
    // Named in their own language, and marked so a reader can tell which they are in.
    expect(japanese).toHaveAttribute('lang', 'ja');
    expect(english).toHaveAttribute('lang', 'en');
    expect(japanese).toHaveAttribute('aria-pressed', 'true');
    expect(english).toHaveAttribute('aria-pressed', 'false');
  });

  it('leaves the one in use in place rather than removing it', async () => {
    const user = userEvent.setup();
    render(<LanguageToggle />);
    await user.click(screen.getByRole('button', { name: 'English' }));
    expect(useLanguageStore.getState().language).toBe('en');
    // Both are still there: a reader looking for the way back has to see it.
    expect(screen.getByRole('button', { name: '日本語' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('says so in the label of the row', async () => {
    const user = userEvent.setup();
    render(<LanguageToggle />);
    expect(screen.getByText('言語:')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByText('Language:')).toBeInTheDocument();
  });
});

describe('the document the language is written on', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'ja' });
    window.localStorage.clear();
    document.documentElement.lang = 'ja';
  });

  it('moves the lang attribute with the text', async () => {
    const user = userEvent.setup();
    render(
      <LanguageBoundary>
        <LanguageToggle />
      </LanguageBoundary>,
    );
    expect(document.documentElement.lang).toBe('ja');
    await user.click(screen.getByRole('button', { name: 'English' }));
    // A screen reader told Japanese and handed English pronounces it as nonsense.
    await waitFor(() => expect(document.documentElement.lang).toBe('en'));
  });

  it('reads the saved language when the page loads', async () => {
    window.localStorage.setItem(languageStorageKey, JSON.stringify({ state: { language: 'en' }, version: 0 }));
    render(
      <LanguageBoundary>
        <LanguageToggle />
      </LanguageBoundary>,
    );
    await waitFor(() => expect(screen.getByText('Language:')).toBeInTheDocument());
    expect(document.documentElement.lang).toBe('en');
  });

  it('takes up the language a Labs tool was left in, when there is nothing of its own', async () => {
    window.localStorage.setItem(
      'nilay-labs-recoil-v1',
      JSON.stringify({ state: { language: 'en', settings: {} }, version: 0 }),
    );
    render(
      <LanguageBoundary>
        <LanguageToggle />
      </LanguageBoundary>,
    );
    await waitFor(() => expect(useLanguageStore.getState().language).toBe('en'));
  });
});
