import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDriveHuntStore } from '@/app/(standalone)/labs/drive-hunt/_store';
import { DriveHuntClient } from '@/app/(standalone)/labs/drive-hunt/drive-hunt-client';
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

const loaded = () => waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());

describe('the drive hunt plan', () => {
  beforeEach(() => {
    useDriveHuntStore.setState(useDriveHuntStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
    useLanguageStore.setState({ language: 'ja' });
  });

  it('draws lots among the people on stands and prints them with a column to sign', async () => {
    const { addStand } = useDriveHuntStore.getState();
    addStand({ latitude: 35.5, longitude: 138.5 });
    addStand({ latitude: 35.501, longitude: 138.502 });
    render(<DriveHuntClient />);
    await loaded();
    for (const [name, role] of [
      ['山田', 'stand'],
      ['佐藤', 'stand'],
      ['鈴木', 'beater'],
    ] as const) {
      fireEvent.change(screen.getByLabelText('氏名'), { target: { value: name } });
      fireEvent.change(screen.getByLabelText('役割'), { target: { value: role } });
      fireEvent.click(screen.getByRole('button', { name: '追加' }));
    }
    fireEvent.click(screen.getByRole('button', { name: '抽選する' }));
    expect(screen.getByText('抽選しました。')).toBeInTheDocument();
    const assigned = useDriveHuntStore.getState().stands.map((stand) => stand.assigneeId);
    const names = assigned.map((id) => useDriveHuntStore.getState().participants.find((p) => p.id === id)?.name);
    expect(names.sort()).toEqual(['佐藤', '山田']);

    const sheet = screen.getByRole('region', { name: '印刷用の配置図' });
    expect(within(sheet).getByText('署名（説明を受けた）')).toBeInTheDocument();
    expect(within(sheet).getByText('鈴木')).toBeInTheDocument();
  });

  it('adds a no-fire direction to a stand and shows it on the sheet', async () => {
    useDriveHuntStore.getState().addStand({ latitude: 35.5, longitude: 138.5 });
    render(<DriveHuntClient />);
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: '撃ってはいけない方向を追加' }));
    fireEvent.change(screen.getByLabelText(/撃たない方向 から/), { target: { value: '80' } });
    fireEvent.change(screen.getByLabelText(/まで（右回り）/), { target: { value: '100' } });
    const sheet = screen.getByRole('region', { name: '印刷用の配置図' });
    expect(within(sheet).getByText('80°–100°（東〜東）')).toBeInTheDocument();
  });
});
