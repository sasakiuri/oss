import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { storageKey, useGunFitStore } from '@/app/(standalone)/labs/gun-fit/_store';
import { GunFitClient } from '@/app/(standalone)/labs/gun-fit/gun-fit-client';
import { discardedSaveMessage } from '@/components/labs';
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

describe('gun fit', () => {
  beforeEach(() => {
    useGunFitStore.setState(useGunFitStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
    useLanguageStore.setState({ language: 'ja' });
  });

  it('records the dimensions, converts the unit, saves by name and fills the print sheet', async () => {
    render(<GunFitClient />);
    await settled();
    fireEvent.click(screen.getByRole('button', { name: /シートを保存/ }));
    expect(screen.getByText('銃の名前を入れてから保存してください。')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('銃の名前'), { target: { value: 'O/U' } });
    fireEvent.change(screen.getByLabelText(/^引き長/), { target: { value: '368' } });
    fireEvent.change(screen.getByLabelText(/^キャスト/), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('radio', { name: '右' }));
    fireEvent.click(screen.getByRole('button', { name: /シートを保存/ }));
    expect(screen.getByText('シートを保存しました。')).toBeInTheDocument();
    expect(useGunFitStore.getState().sheets).toHaveLength(1);
    // The print sheet carries the values and leaves an empty box for what was not measured.
    expect(screen.getByText('368 mm')).toBeInTheDocument();
    expect(screen.getByText('3 mm 右へ')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'インチ' }));
    expect(useGunFitStore.getState().sheet).toMatchObject({ unit: 'inch', lengthOfPull: 14.49, cast: 0.12 });
    const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}');
    expect(saved.state.sheets[0]).toMatchObject({ name: 'O/U', lengthOfPull: 368, castSide: 'right' });
  });

  it('tallies the eye test and names an eye only past half the trials', async () => {
    render(<GunFitClient />);
    await settled();
    fireEvent.click(screen.getByRole('button', { name: '右目' }));
    fireEvent.click(screen.getByRole('button', { name: '左目' }));
    expect(screen.getByText(/半数を超えた目はありません/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '右目' }));
    expect(screen.getByText(/半数を超えたのは右目です/)).toBeInTheDocument();
  });

  it('says so when the saved data cannot be read', async () => {
    window.localStorage.setItem(storageKey, JSON.stringify({ state: { sheet: null }, version: 0 }));
    render(<GunFitClient />);
    await settled();
    await waitFor(() => expect(screen.getAllByText(discardedSaveMessage('ja')).length).toBeGreaterThan(0));
  });
});
