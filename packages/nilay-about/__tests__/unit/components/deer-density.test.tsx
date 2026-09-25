import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEER_DENSITY_STORAGE_KEY, useDeerDensityStore } from '@/app/(standalone)/labs/deer-density/_store';
import { DeerDensityClient } from '@/app/(standalone)/labs/deer-density/deer-density-client';
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

const renderReady = async () => {
  const { container } = render(<DeerDensityClient />);
  await waitFor(() => expect(container.querySelector('[aria-busy]')).toHaveAttribute('aria-busy', 'false'));
};

describe('deer density', () => {
  beforeEach(() => {
    useDeerDensityStore.setState(useDeerDensityStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
    useLanguageStore.setState({ language: 'ja' });
  });

  it('opens FUNRYU on the paper’s own example', async () => {
    await renderReady();
    fireEvent.click(screen.getByLabelText('糞粒法（FUNRYU）'));
    expect(screen.getByText('12.57')).toBeInTheDocument();
  });

  it('marks an impossible count and keeps the last valid settings', async () => {
    await renderReady();
    fireEvent.click(screen.getByLabelText('糞粒法（消失率を実測）'));
    fireEvent.change(screen.getByLabelText(/残っていた糞の数/), { target: { value: '150' } });
    expect(screen.getByText('0 より大きく、置いた数より少ない数を入力してください。')).toBeInTheDocument();
    expect(screen.getByText('入力を確認してください。')).toBeInTheDocument();
    const saved = JSON.parse(window.localStorage.getItem(DEER_DENSITY_STORAGE_KEY) ?? 'null');
    expect(saved.state.settings.clearance.remaining).toBe(80);
  });
});
