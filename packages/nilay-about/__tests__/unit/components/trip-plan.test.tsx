import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { storageKey, useTripPlanStore } from '@/app/(standalone)/labs/trip-plan/_store';
import { TripPlanClient } from '@/app/(standalone)/labs/trip-plan/trip-plan-client';
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

describe('the outing plan', () => {
  beforeEach(() => {
    useTripPlanStore.setState(useTripPlanStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
    useLanguageStore.setState({ language: 'ja' });
  });

  it('builds the card and refuses a return before the departure', async () => {
    render(<TripPlanClient />);
    await loaded();
    fireEvent.change(screen.getByLabelText('氏名'), { target: { value: '山田' } });
    fireEvent.change(screen.getByLabelText('出発'), { target: { value: '2026-11-15T06:00' } });
    fireEvent.change(screen.getByLabelText('帰着予定'), { target: { value: '2026-11-15T05:00' } });
    expect(screen.getByText('帰着予定は出発より後にしてください。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'カレンダーに追加（.ics）' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('帰着予定'), { target: { value: '2026-11-15T16:00' } });
    expect(screen.getByRole('button', { name: 'カレンダーに追加（.ics）' })).toBeEnabled();
    const printable = screen.getByRole('region', { name: '印刷用のカード' });
    expect(within(printable).getByText('山田')).toBeInTheDocument();
  });

  it('keeps nothing unless asked, and forgets it when saving is turned off', async () => {
    render(<TripPlanClient />);
    await loaded();
    fireEvent.change(screen.getByLabelText('氏名'), { target: { value: '山田' } });
    expect(window.localStorage.getItem(storageKey)).not.toContain('山田');
    fireEvent.click(screen.getByLabelText('この端末に保存する'));
    expect(window.localStorage.getItem(storageKey)).toContain('山田');
    fireEvent.click(screen.getByLabelText('この端末に保存する'));
    expect(window.localStorage.getItem(storageKey)).not.toContain('山田');
  });
});
