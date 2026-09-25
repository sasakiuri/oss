import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VILLAGE_CHECK_STORAGE_KEY, useVillageCheckStore } from '@/app/(standalone)/labs/village-check/_store';
import { VillageCheckClient } from '@/app/(standalone)/labs/village-check/village-check-client';
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
  const { container } = render(<VillageCheckClient />);
  await waitFor(() => expect(container.querySelector('[aria-busy]')).toHaveAttribute('aria-busy', 'false'));
};

describe('the village attractant check', () => {
  beforeEach(() => {
    useVillageCheckStore.setState(useVillageCheckStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
    useLanguageStore.setState({ language: 'ja' });
  });

  it('asks for a date before saving, then keeps the inspection on this device', async () => {
    await renderReady();
    const item = screen.getByRole('group', { name: 'お墓に残されたお供え物' });
    fireEvent.click(within(item).getByLabelText('あり'));
    fireEvent.change(screen.getByLabelText('「お墓に残されたお供え物」の場所・内容'), { target: { value: '北墓地' } });
    fireEvent.click(screen.getByRole('button', { name: '点検を保存' }));
    expect(screen.getByText('点検日を入力してください。')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('点検日'), { target: { value: '2026-09-24' } });
    fireEvent.click(screen.getByRole('button', { name: '点検を保存' }));
    const saved = JSON.parse(window.localStorage.getItem(VILLAGE_CHECK_STORAGE_KEY) ?? 'null');
    expect(saved.state.inspections[0]).toMatchObject({
      date: '2026-09-24',
      results: { grave: { status: 'found', note: '北墓地' } },
    });
    // The form is empty for the next inspection, compared with the one just saved.
    expect(screen.getByLabelText('点検日')).toHaveValue('');
    expect(screen.getByText('前回（2026-09-24）との比較')).toBeInTheDocument();
  });
});
