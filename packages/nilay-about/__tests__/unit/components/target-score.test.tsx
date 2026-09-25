import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { storageKey, useTargetScoreStore } from '@/app/(standalone)/labs/target-score/_store';
import { TargetScoreClient } from '@/app/(standalone)/labs/target-score/target-score-client';
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

const store = () => useTargetScoreStore.getState();

describe('target scoring', () => {
  beforeEach(() => {
    useTargetScoreStore.setState(useTargetScoreStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });

  it('scores tapped shots to a tenth, leaves sighters out and totals the series', async () => {
    render(<TargetScoreClient />);
    await screen.findByRole('heading', { name: '3. 得点' });
    act(() => {
      store().setSighting(true);
      store().addShot({ x: 10, y: 0 });
      store().setSighting(false);
      store().addShot({ x: 0, y: 0 });
      store().addShot({ x: 0, y: 3 });
    });
    expect(screen.getByText('試射 1：7.0')).toBeInTheDocument();
    expect(screen.getByText('1 発目：10.9*')).toBeInTheDocument();
    expect(screen.getByText('2 発目：9.8')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByRole('row', { name: '1 2 20.7 1' })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('整数'));
    expect(screen.getByText('1 発目：10*')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByRole('row', { name: '1 2 19 1' })).toBeInTheDocument();
  });

  it('keeps the card across a reload and saves it by name', async () => {
    act(() => {
      store().addShot({ x: 1, y: 1 });
    });
    const saved = window.localStorage.getItem(storageKey)!;
    useTargetScoreStore.setState(useTargetScoreStore.getInitialState(), true);
    window.localStorage.setItem(storageKey, saved);
    await act(() => useTargetScoreStore.persist.rehydrate());
    expect(store().shots).toMatchObject([{ x: 1, y: 1, sighter: false }]);
    expect(store().saveSession('practice')).toBe(true);
    expect(store().saveSession('practice')).toBe(false);
    act(() => store().clearShots());
    expect(store().loadSession(store().sessions[0]!.id)).toBe(true);
    expect(store().shots).toHaveLength(1);
  });

  it('scores the 25 m pistol target in whole rings only', () => {
    act(() => store().setTarget('P25'));
    expect(store().decimal).toBe(false);
    act(() => store().setDecimal(true));
    expect(store().decimal).toBe(false);
  });

  it('says when saved data could not be read', async () => {
    window.localStorage.setItem(storageKey, JSON.stringify({ state: { target: 'XX' }, version: 0 }));
    await useTargetScoreStore.persist.rehydrate();
    expect(useStorageStatus.getState().discarded).toEqual([storageKey]);
  });
});
