import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { storageKey, useFreezerStore } from '@/app/(standalone)/labs/freezer-stock/_store';
import { FreezerStockClient } from '@/app/(standalone)/labs/freezer-stock/freezer-stock-client';
import { useStorageStatus } from '@/lib/browser-storage';
import { useLanguageStore } from '@/store';

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

const renderTool = async () => {
  const view = render(<FreezerStockClient />);
  await waitFor(() => expect(view.container.querySelector('[aria-busy="true"]')).toBeNull());
  return view;
};
const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 24, 12, 0));
  useLanguageStore.setState({ language: 'ja' });
  useFreezerStore.setState(useFreezerStore.getInitialState(), true);
  window.localStorage.clear();
  useStorageStatus.setState({ available: true, discarded: [] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the freezer list', () => {
  it('adds packs dated today, lists the oldest first and takes packs out', async () => {
    await renderTool();
    expect(screen.getByLabelText('冷凍した日')).toHaveValue('2026-09-24');
    type('部位・品名', 'ロース');
    type(/^1 パックの重さ/, '400');
    type(/^パック数/, '3');
    fireEvent.click(screen.getByRole('button', { name: '追加する' }));
    type('部位・品名', 'モモ');
    type('冷凍した日', '2026-08-01');
    type('使い切る日（任意）', '2026-09-20');
    fireEvent.click(screen.getByRole('button', { name: '追加する' }));

    const list = screen.getByRole('region', { name: '冷凍庫の中身' });
    const lines = within(list).getAllByRole('listitem');
    expect(lines[0]).toHaveTextContent('シカ・モモ');
    expect(lines[0]).toHaveTextContent('54 日経過');
    expect(lines[0]).toHaveTextContent('使い切る日を 4 日過ぎています');
    expect(lines[1]).toHaveTextContent('3 パック × 400 g');
    expect(list).toHaveTextContent('4 パック・1.2 kg（重さ未入力の 1 パックを除く）');

    fireEvent.click(within(lines[1]!).getByRole('button', { name: 'シカ・ロース を 1 パック取り出す' }));
    expect(list).toHaveTextContent('3 パック・0.8 kg');
    expect(window.localStorage.getItem(storageKey)).toContain('"packs":2');
  });
});
