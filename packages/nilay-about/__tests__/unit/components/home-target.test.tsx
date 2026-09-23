import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TARGET_STORAGE_KEY,
  initialTargetSettings,
  useHomeTargetStore,
} from '@/app/(standalone)/labs/home-target/_store';
import { HomeTargetClient } from '@/app/(standalone)/labs/home-target/home-target-client';
import { createSettingsHash } from '@/app/(standalone)/labs/home-target/share';
import { discardedSaveMessage } from '@/components/labs';
import { useStorageStatus } from '@/lib/browser-storage';
import { useLanguageStore } from '@/store';

// Only the shared chrome is stubbed: it needs the Next.js app router, which a unit
// render has not mounted. The notice and its wording stay real.
vi.mock('@/components/labs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/labs')>();
  const { createElement } = await import('react');
  return {
    ...actual,
    AppLayout: ({ header, children }: { header: ReactNode; children: ReactNode }) =>
      createElement('div', null, header, children),
    AppHeader: ({ title, actions }: { title: string; actions?: ReactNode }) =>
      createElement('header', null, title, actions),
    LanguageMenu: () => null,
  };
});

// The announcement region is the sr-only one: the loading line is a status too.
const statusRegion = () => screen.getAllByRole('status').find((node) => node.className.includes('sr-only'));

// Renders the tool and waits until the saved state has been read and the form is no longer busy.
async function renderLoaded() {
  const view = render(<HomeTargetClient />);
  await waitFor(() => expect(view.container.querySelector('[aria-busy="true"]')).toBeNull());
  return view;
}

describe('home target announcements', () => {
  beforeEach(() => {
    // One test makes the browser refuse every write, so the restore comes before anything else.
    vi.restoreAllMocks();
    // persist writes on every set, so the reset comes first and the clear leaves storage truly empty.
    useHomeTargetStore.setState(useHomeTargetStore.getInitialState(), true);
    window.localStorage.clear();
    window.location.hash = '';
    useStorageStatus.setState({ available: true, discarded: [] });
    // The language is the site's now, so it outlives this store's reset.
    useLanguageStore.setState({ language: 'ja' });
  });

  it('has its region on the page before the saved setups are read', () => {
    const { container } = render(<HomeTargetClient />);
    // Rendered with the defaults, and held busy until the saved setups are read.
    expect(container.querySelector('[aria-busy="true"]')).toContainElement(screen.getByLabelText('競技種目'));
    expect(statusRegion()?.textContent).toBe('');
  });

  it('shows and announces a setup it could not read', async () => {
    window.localStorage.setItem(TARGET_STORAGE_KEY, JSON.stringify({ state: { language: 'klingon' }, version: 0 }));
    await renderLoaded();
    const notice = discardedSaveMessage('ja');
    await waitFor(() => expect(screen.getAllByText(notice)).toHaveLength(2));
    expect(statusRegion()?.textContent).toBe(notice);
  });

  it('says the shared setup is on screen, not the defaults, in both places', async () => {
    window.localStorage.setItem(TARGET_STORAGE_KEY, JSON.stringify({ state: { language: 'klingon' }, version: 0 }));
    window.location.hash = createSettingsHash(initialTargetSettings);
    await renderLoaded();
    const shared = discardedSaveMessage('ja', 'settings-shared');
    await waitFor(() => expect(screen.getAllByText(shared)).toHaveLength(2));
    expect(screen.queryByText(discardedSaveMessage('ja'))).toBeNull();
    expect(statusRegion()?.textContent).toBe(shared);
  });

  it('stays quiet when the saved setup still parses', async () => {
    await renderLoaded();
    await screen.findByText('設置条件');
    expect(screen.queryByText(discardedSaveMessage('ja'))).toBeNull();
    expect(statusRegion()?.textContent).toBe('');
  });

  it('says nothing about another tool losing its saved data', async () => {
    window.localStorage.setItem('nilay-labs-other-v1', '{broken');
    await renderLoaded();
    await screen.findByText('設置条件');
    expect(screen.queryByText(discardedSaveMessage('ja'))).toBeNull();
  });

  it('is read in the language of the interface', async () => {
    await renderLoaded();
    await screen.findByText('設置条件');
    expect(statusRegion()).toHaveAttribute('lang', 'ja');
  });

  it('says a restored setup did not reach this device when the write is refused', async () => {
    await renderLoaded();
    fireEvent.change(await screen.findByLabelText('設定名'), { target: { value: '自宅' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    fireEvent.click(screen.getByRole('button', { name: '「自宅」を編集' }));
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    // The delete wrote too and failed, so the flag is put back: what is under test is the write
    // that restoring does, not the one before it.
    act(() => useStorageStatus.setState({ available: true }));
    fireEvent.click(screen.getByRole('button', { name: '元に戻す' }));
    // The setup is back on screen, but it is not on the device, and saying "Restored" alone would
    // leave the reader believing it would still be there tomorrow.
    expect(screen.getByRole('button', { name: '自宅' })).toBeInTheDocument();
    expect(screen.getByText('端末に保存できませんでした。')).toBeInTheDocument();
  });

  it('restates a standing message in the language chosen after it appeared', async () => {
    await renderLoaded();
    fireEvent.change(await screen.findByLabelText('設定名'), { target: { value: '自宅' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    const region = screen.getAllByRole('status').find((node) => node.textContent === '保存しました。');
    expect(region).toBeDefined();
    // The card takes its lang from the wrapper, which follows the switch. Text fixed at the moment
    // it was written would be left claiming a language it is not in.
    act(() => useLanguageStore.getState().setLanguage('en'));
    expect(region?.textContent).toBe('Saved.');
  });
});

describe('the discipline on a first visit', () => {
  beforeEach(() => {
    useHomeTargetStore.setState(useHomeTargetStore.getInitialState(), true);
    window.localStorage.clear();
    window.location.hash = '';
    useStorageStatus.setState({ available: true, discarded: [] });
    useLanguageStore.setState({ language: 'ja' });
  });

  it('opens on a named discipline whose fixed dimensions say how to change them', async () => {
    await renderLoaded();
    const discipline = await screen.findByLabelText('競技種目');
    expect(discipline).toHaveValue('FR50');
    expect(screen.getByText('160.5 cm')).toBeInTheDocument();
    expect(screen.getByText('1.12 cm')).toBeInTheDocument();
    // Fixed by the rules, so they are stated in the closed section's heading rather than offered as fields.
    const section = () => screen.getByRole('button', { name: /^競技種目の寸法/ });
    expect(section()).toHaveAttribute('aria-expanded', 'false');
    expect(section()).toHaveTextContent('距離 50 m・中心の高さ 75 cm・黒丸の直径 11.24 cm');
    expect(screen.queryByLabelText('競技の黒丸の直径', { exact: false })).toBeNull();
    const hint = '変えるには、競技種目で「カスタム（寸法を指定）」を選びます。';
    expect(screen.getByText(hint)).toBeInTheDocument();
    fireEvent.change(discipline, { target: { value: 'CUSTOM' } });
    expect(screen.queryByText(hint)).toBeNull();
    // A custom discipline is only as good as the dimensions typed into it, so they cannot be closed away.
    expect(section()).toHaveAttribute('aria-expanded', 'true');
    expect(section()).toHaveAttribute('aria-disabled', 'true');
    const diameter = screen.getByRole('spinbutton', { name: /競技の黒丸の直径/ });
    expect(diameter).not.toHaveAttribute('readonly');
    fireEvent.change(diameter, { target: { value: '22.48' } });
    expect(screen.getByText('2.25 cm')).toBeInTheDocument();
  });

  it('opens the print settings when the targets do not fit the paper', async () => {
    await renderLoaded();
    const print = () => screen.getByRole('button', { name: /^印刷の設定/ });
    await screen.findByLabelText('競技種目');
    expect(print()).toHaveAttribute('aria-expanded', 'false');
    expect(print()).toHaveTextContent('A4・1 ページに 1 個・設置条件は印字しない');
    // 50 m from a 50 m discipline prints the full 11.24 cm circle, and six of those overrun A4.
    fireEvent.change(screen.getByLabelText('標的までの距離', { exact: false }), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('1 ページの標的数'), { target: { value: '6' } });
    expect(screen.getByText('この用紙には収まりません。', { exact: false })).toBeInTheDocument();
    expect(print()).toHaveAttribute('aria-expanded', 'true');
    expect(print()).toHaveAttribute('aria-disabled', 'true');
  });

  it('shows a bare dash, not a unit, while there is no figure', async () => {
    await renderLoaded();
    fireEvent.change(await screen.findByLabelText('目の高さ', { exact: false }), { target: { value: '' } });
    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.queryByText('— cm')).toBeNull();
  });
});
