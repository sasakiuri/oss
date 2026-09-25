import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useShotGroupStore } from '@/app/(standalone)/labs/shot-group/_store';
import { ShotGroupClient } from '@/app/(standalone)/labs/shot-group/shot-group-client';
import { useStorageStatus } from '@/lib/browser-storage';

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

const store = () => useShotGroupStore.getState();
const open = async (title: RegExp) => {
  const heading = await screen.findByRole('heading', { name: title });
  const toggle = within(heading).getByRole('button');
  if (toggle.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle);
};

describe('shot group: corner marks, several groups and the trend', () => {
  beforeEach(() => {
    useShotGroupStore.setState(useShotGroupStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });

  it('offers the corner marks with the A4 spacing and a mode to place them', async () => {
    render(<ShotGroupClient />);
    await open(/^2\. 実寸を合わせる/);
    fireEvent.click(screen.getByLabelText('四隅の目印'));
    expect(screen.getByLabelText(/目印の中心間（横）/)).toHaveValue(186);
    expect(screen.getByLabelText(/目印の中心間（縦）/)).toHaveValue(273);
    expect(screen.getByRole('button', { name: /^2\. 実寸を合わせる/ })).toHaveTextContent(
      '四隅の目印（中心間 186 × 273 mm）で斜めの写真を補正',
    );
    const modes = screen.getByRole('group', { name: '図をタップして置くもの' });
    expect(within(modes).getByLabelText('四隅の目印')).toBeInTheDocument();
    expect(within(modes).queryByLabelText('基準点 A')).toBeNull();
    // Out of order, the marks fold the sheet over, and nothing is measured.
    act(() => store().setCorner(0, { x: 1100, y: 800 }));
    expect(screen.getByText(/1 左上・2 右上・3 右下・4 左下の順に/)).toBeInTheDocument();
  });

  it('keeps a finished group, compares the groups, and edits an earlier one', async () => {
    render(<ShotGroupClient />);
    await screen.findByRole('heading', { name: '4. 着弾を記録する' });
    act(() => {
      store().addImpactAtOffset({ x: 0, y: 0 });
      store().addImpactAtOffset({ x: 10, y: 0 });
    });
    fireEvent.click(screen.getByRole('button', { name: 'この群を残して次の群を始める' }));
    expect(screen.getByText('この写真の群：2 群（編集中は群 2）')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getByRole('row', { name: /^1 2 10 mm/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '群 1 を編集' }));
    expect(screen.getByText('この写真の群：2 群（編集中は群 1）')).toBeInTheDocument();
    expect(store().impacts).toHaveLength(2);
  });

  it('draws the saved groups over time once there are two', async () => {
    render(<ShotGroupClient />);
    await open(/^7\. 記録を保存/);
    act(() => {
      store().addImpactAtOffset({ x: 0, y: 0 });
      store().addImpactAtOffset({ x: 29.1, y: 0 });
      store().saveRecord('first');
    });
    expect(screen.queryByRole('img', { name: /推移/ })).toBeNull();
    act(() => {
      store().saveRecord('second');
    });
    expect(
      screen.getByRole('img', { name: '保存した 2 群の最大中心間距離と平均半径の推移（MOA）' }),
    ).toBeInTheDocument();
  });
});
