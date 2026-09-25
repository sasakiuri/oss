import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { gearStorageKey, useGearStore } from '@/app/(standalone)/labs/shotgun-gear/_store';
import { ShotgunGearClient } from '@/app/(standalone)/labs/shotgun-gear/shotgun-gear-client';
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

const settled = () => waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());

describe('shotgun gear', () => {
  beforeEach(() => {
    useGearStore.setState(useGearStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
    useLanguageStore.setState({ language: 'ja' });
  });
  afterEach(() => vi.restoreAllMocks());

  it('registers a gun, a choke and a cartridge, combines them and saves the registry', async () => {
    render(<ShotgunGearClient />);
    await settled();
    fireEvent.change(screen.getByLabelText('銃の名前'), { target: { value: 'O/U' } });
    fireEvent.change(screen.getByLabelText('銃身 1 の呼び名'), { target: { value: '上' } });
    fireEvent.click(screen.getByRole('button', { name: '銃を登録' }));
    expect(screen.getByText('銃を登録しました。')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('チョークの名前'), { target: { value: 'IC' } });
    fireEvent.click(screen.getByRole('button', { name: 'チョークを登録' }));

    fireEvent.change(screen.getByLabelText('装弾の名前'), { target: { value: 'Trap 24 g' } });
    fireEvent.change(screen.getByLabelText('号数から直径を入れる'), { target: { value: '7.5' } });
    expect(screen.getByLabelText(/粒の直径/)).toHaveValue(2.413);
    fireEvent.change(screen.getByLabelText(/装弾量/), { target: { value: '24' } });
    fireEvent.click(screen.getByRole('button', { name: '装弾を登録' }));
    expect(screen.getByText(/約 289 粒/)).toBeInTheDocument();

    const gun = useGearStore.getState().guns[0]!;
    fireEvent.change(screen.getByLabelText('銃身'), { target: { value: `${gun.id}/${gun.barrels[0]!.id}` } });
    fireEvent.change(screen.getByLabelText('チョーク'), { target: { value: useGearStore.getState().chokes[0]!.id } });
    fireEvent.change(screen.getByLabelText('装弾'), { target: { value: useGearStore.getState().cartridges[0]!.id } });
    fireEvent.click(screen.getByRole('button', { name: '組み合わせを登録' }));
    expect(screen.getByText('O/U（IC） ／ Trap 24 g')).toBeInTheDocument();

    const saved = JSON.parse(window.localStorage.getItem(gearStorageKey) ?? '{}');
    expect(saved.state.setups).toHaveLength(1);
  });

  it('asks before deleting and takes the combinations that use the gear with it', async () => {
    useGearStore.getState().addGun({ name: 'Auto', gauge: '', barrels: [{ label: '1', lengthCm: null }] });
    const gun = useGearStore.getState().guns[0]!;
    useGearStore.getState().addSetup({ gunId: gun.id, barrelId: gun.barrels[0]!.id, chokeId: null, cartridgeId: null });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<ShotgunGearClient />);
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Auto を削除' }));
    expect(useGearStore.getState().guns).toHaveLength(1);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Auto を削除' }));
    expect(useGearStore.getState()).toMatchObject({ guns: [], setups: [] });
  });

  it('refuses a cartridge without its figures', async () => {
    render(<ShotgunGearClient />);
    await settled();
    fireEvent.change(screen.getByLabelText('装弾の名前'), { target: { value: 'No numbers' } });
    fireEvent.click(screen.getByRole('button', { name: '装弾を登録' }));
    expect(screen.getByText(/名前・粒の直径・密度・装弾量を入れてください/)).toBeInTheDocument();
    expect(useGearStore.getState().cartridges).toEqual([]);
  });
});
