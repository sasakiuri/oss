import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePcpFillStore } from '@/app/(standalone)/labs/pcp-fill/_store';
import { PcpFillClient } from '@/app/(standalone)/labs/pcp-fill/pcp-fill-client';
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

describe('PCP fill calculator', () => {
  beforeEach(() => {
    usePcpFillStore.setState(usePcpFillStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });

  it('counts the full fills and the shots they give', async () => {
    render(<PcpFillClient />);
    expect(await screen.findByText('60', { selector: 'p' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('1 回の充填で撃てる発数（任意）'), { target: { value: '40' } });
    expect(screen.getByText('約 2,400 発')).toBeInTheDocument();
  });

  it('converts the pressures when the unit changes', async () => {
    render(<PcpFillClient />);
    fireEvent.click(await screen.findByLabelText('MPa'));
    expect(usePcpFillStore.getState()).toMatchObject({ tankPressure: 30, fillPressure: 20, refillPressure: 10 });
    expect(screen.getByText('60', { selector: 'p' })).toBeInTheDocument();
  });

  it('asks for a fill pressure above the pressure before filling', async () => {
    render(<PcpFillClient />);
    fireEvent.change(await screen.findByLabelText(/^充填する圧力/), { target: { value: '50' } });
    expect(screen.getByText('充填前の圧力より高くしてください。')).toBeInTheDocument();
    expect(screen.getByText('入力を確認してください。')).toBeInTheDocument();
  });
});
