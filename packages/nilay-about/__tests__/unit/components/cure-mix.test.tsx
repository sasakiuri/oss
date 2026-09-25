import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { storageKey, useCureMixStore } from '@/app/(standalone)/labs/cure-mix/_store';
import { CureMixClient } from '@/app/(standalone)/labs/cure-mix/cure-mix-client';
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
  const view = render(<CureMixClient />);
  await waitFor(() => expect(view.container.querySelector('[aria-busy="true"]')).toBeNull());
  return view;
};
const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const result = () => screen.getByRole('region', { name: '配合' });

beforeEach(() => {
  useLanguageStore.setState({ language: 'ja' });
  useCureMixStore.setState(useCureMixStore.getInitialState(), true);
  window.localStorage.clear();
  useStorageStatus.setState({ available: true, discarded: [] });
});

describe('the batch', () => {
  it('opens with no recipe filled in and weighs out the salt once it is given', async () => {
    await renderTool();
    expect(screen.getByLabelText(/^食塩 \(%\)/)).toHaveValue(null);
    type(/^脂 \(g\)/, '250');
    type(/^食塩 \(%\)/, '1.8');
    const table = within(result()).getByRole('table');
    expect(within(table).getByRole('row', { name: /食塩（加える分）/ })).toHaveTextContent('22.5');
    expect(result()).toHaveTextContent('1,273');
    expect(screen.getByText(/肉 1,250 g のうち脂 20 %/)).toBeInTheDocument();
    expect(window.localStorage.getItem(storageKey)).toContain('1.8');
  });

  it('gives the nitrite added without judging it against the residue limit', async () => {
    await renderTool();
    type(/^食塩 \(%\)/, '2');
    fireEvent.click(screen.getByLabelText('亜硝酸ナトリウムを含む製剤を使う'));
    expect(result()).toHaveTextContent('製剤の亜硝酸含有率を入力してください');
    type(/^製剤の量/, '0.25');
    type(/^製剤の亜硝酸含有率/, '6.25');
    type(/^製剤の食塩含有率/, '93.75');
    expect(result()).toHaveTextContent('全体 1 kg あたり 102.1 mg');
    expect(result()).toHaveTextContent('残存量は検査で確かめます');
    expect(within(result()).queryByRole('alert')).toBeNull();
    type(/^製剤の量/, '0.15');
    expect(result()).not.toHaveTextContent('上限を超えて残ることはありません');
    expect(result()).not.toHaveTextContent('上限に当たる製剤の量');
  });

  it('marks an agent whose contents come to more than 100 %', async () => {
    await renderTool();
    fireEvent.click(screen.getByLabelText('亜硝酸ナトリウムを含む製剤を使う'));
    type(/^製剤の量/, '0.25');
    type(/^製剤の亜硝酸含有率/, '60');
    type(/^製剤の食塩含有率/, '60');
    expect(result()).toHaveTextContent('製剤の食塩と亜硝酸ナトリウムの合計が 100 % を超えています');
    expect(result()).not.toHaveTextContent('全体 1 kg あたり');
  });

  it('blends two trimmings to a fat share and puts the weights in', async () => {
    await renderTool();
    fireEvent.click(screen.getByRole('button', { name: /^脂の割合を合わせる/ }));
    type(/^合計の肉/, '2000');
    type(/^目標の脂の割合/, '25');
    type(/^赤身の脂の割合/, '0');
    type(/^脂身の脂の割合/, '100');
    fireEvent.click(screen.getByRole('button', { name: 'この量を肉の欄に入れる' }));
    expect(screen.getByLabelText(/^赤身 \(g\)/)).toHaveValue(1500);
    expect(screen.getByLabelText(/^脂 \(g\)/)).toHaveValue(500);
  });
});
