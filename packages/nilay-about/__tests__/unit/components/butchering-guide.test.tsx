import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ButcheringGuideClient } from '@/app/(standalone)/labs/butchering-guide/butchering-guide-client';
import { BUTCHERING_STAGES } from '@/lib/butchering-steps';
import { GAME_CUTS, saleCuts } from '@/lib/game-cuts';
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

beforeEach(() => useLanguageStore.setState({ language: 'ja' }));

describe('the cut chart', () => {
  it('names the cuts of each species as the chart does', () => {
    expect(GAME_CUTS.deer.map((cut) => cut.ja)).toEqual([
      'ネック',
      'カタ',
      'ロース',
      'モモ',
      '外モモ',
      'シンタマ',
      '内モモ',
      'スネ',
      '前スネ',
    ]);
    expect(saleCuts('boar').map((cut) => cut.ja)).toEqual([
      'ネック',
      'カタ',
      '肩ロース',
      'ロース',
      'バラ',
      '外モモ',
      'シンタマ',
      '内モモ',
      'スネ',
      '前スネ',
    ]);
  });

  it('gives every hygiene step a section of the guideline', () => {
    for (const stage of BUTCHERING_STAGES) for (const step of stage.steps) expect(step.where).toMatch(/^第 \d/);
  });
});

describe('the guide', () => {
  it('shows the chosen cut and ticks off steps', async () => {
    const { container } = render(<ButcheringGuideClient />);
    await waitFor(() => expect(container.querySelector('[aria-busy="true"]')).toBeNull());
    fireEvent.click(within(screen.getByRole('group', { name: '動物' })).getByRole('radio', { name: 'イノシシ' }));
    fireEvent.click(screen.getByRole('button', { name: '肩ロース' }));
    const result = screen.getByRole('region', { name: '部位' });
    expect(within(result).getByRole('heading', { name: '肩ロース' })).toBeInTheDocument();
    expect(result).toHaveTextContent('36 kg 以上の個体は第 5〜6 肋骨の間');
    const step = screen.getByLabelText(/83℃ 以上の熱湯/);
    fireEvent.click(step);
    expect(step).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'チェックを外す' }));
    expect(step).not.toBeChecked();
  });
});
