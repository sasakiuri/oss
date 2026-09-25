import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { storageKey, useCoordinateConvertStore } from '@/app/(standalone)/labs/coordinate-convert/_store';
import { CoordinateConvertClient } from '@/app/(standalone)/labs/coordinate-convert/coordinate-convert-client';
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

describe('the coordinate converter', () => {
  beforeEach(() => {
    useCoordinateConvertStore.setState(useCoordinateConvertStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
    useLanguageStore.setState({ language: 'ja' });
  });

  it('converts the opening point into every format', async () => {
    render(<CoordinateConvertClient />);
    await loaded();
    expect(screen.getByText('35.658100, 139.741400')).toBeInTheDocument();
    expect(screen.getByText(/^54S UE /)).toBeInTheDocument();
    // Tokyo reference point, third-level square.
    expect(screen.getByText('53393589')).toBeInTheDocument();
  });

  it('reads a grid square code and shows its centre', async () => {
    render(<CoordinateConvertClient />);
    await loaded();
    fireEvent.click(screen.getByRole('radio', { name: 'メッシュ' }));
    fireEvent.change(screen.getByLabelText('メッシュコード'), { target: { value: '5438234' } });
    expect(screen.getByText('メッシュの中心です。')).toBeInTheDocument();
    expect(screen.getAllByText('5438234').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('メッシュコード'), { target: { value: '5438235' } });
    expect(screen.getByText(/メッシュコードとして読めません/)).toBeInTheDocument();
  });

  it('keeps what was typed after a reload, and reports a save it cannot read', async () => {
    window.localStorage.setItem(storageKey, JSON.stringify({ state: { input: { format: 'nope' } }, version: 0 }));
    render(<CoordinateConvertClient />);
    await loaded();
    expect(useStorageStatus.getState().discarded).toContain(storageKey);
  });
});
