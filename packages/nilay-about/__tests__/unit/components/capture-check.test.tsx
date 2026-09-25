import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CAPTURE_CHECK_STORAGE_KEY, useCaptureCheckStore } from '@/app/(standalone)/labs/capture-check/_store';
import { CaptureCheckClient } from '@/app/(standalone)/labs/capture-check/capture-check-client';
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

const saved = () => JSON.parse(window.localStorage.getItem(CAPTURE_CHECK_STORAGE_KEY) ?? 'null');

const renderReady = async () => {
  const { container } = render(<CaptureCheckClient />);
  await waitFor(() => expect(container.querySelector('[aria-busy]')).toHaveAttribute('aria-busy', 'false'));
};

describe('capture photos and payments', () => {
  beforeEach(() => {
    useCaptureCheckStore.setState(useCaptureCheckStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
    useLanguageStore.setState({ language: 'ja' });
  });

  it('says the municipality’s instructions take precedence', async () => {
    await renderReady();
    expect(screen.getByText(/市町村の指定があれば、それに従ってください/)).toBeInTheDocument();
  });

  it('adds the permit item only for a capture made alone', async () => {
    await renderReady();
    expect(screen.queryByLabelText(/許可証か従事者証を添えた/)).toBeNull();
    expect(screen.getByText('0 / 5 項目')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('1 人で捕獲した'));
    fireEvent.click(screen.getByLabelText(/許可証か従事者証を添えた/));
    expect(screen.getByText('1 / 6 項目')).toBeInTheDocument();
    expect(saved().state).toMatchObject({ solo: true, checked: ['permit'] });
  });

  it('puts the board text in the preview and never saves it', async () => {
    await renderReady();
    fireEvent.change(screen.getByLabelText('捕獲従事者氏名'), { target: { value: '山田 太郎' } });
    expect(screen.getAllByText('山田 太郎').length).toBeGreaterThan(0);
    expect(JSON.stringify(saved())).not.toContain('山田');
  });

  it('totals the payment from the national limit and the local additions', async () => {
    await renderReady();
    fireEvent.click(screen.getByRole('button', { name: /報償金の試算/ }));
    fireEvent.click(screen.getByRole('button', { name: '行を追加' }));
    fireEvent.change(screen.getByLabelText('1 行目の市町村の額'), { target: { value: '5000' } });
    fireEvent.change(screen.getByLabelText('1 行目の頭数'), { target: { value: '2' } });
    // Burial and the like: 7,000 yen national.
    expect(screen.getAllByText('合計 24,000 円').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('1 行目の頭数'), { target: { value: '' } });
    expect(screen.getByText('整数で入力')).toBeInTheDocument();
    expect(saved().state.rows[0].heads).toBeNull();
  });
});
