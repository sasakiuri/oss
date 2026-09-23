import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { storageKey, useMeatYieldStore } from '@/app/(standalone)/labs/meat-yield/_store';
import { MeatYieldClient } from '@/app/(standalone)/labs/meat-yield/meat-yield-client';
import { discardedSaveMessage } from '@/components/labs';
import { useStorageStatus } from '@/lib/browser-storage';
import { useLanguageStore } from '@/store';

// Only the shared chrome is stubbed: it needs the Next.js app router, which a unit
// render has not mounted. The notices, the reset dialog and their wording stay real.
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

const spokenRegions = () =>
  screen.getAllByRole('status').filter((node) => node.tagName === 'P' && node.className.includes('sr-only'));

/** The figure printed beside a result label, such as 「6kg」. */
const figure = (label: string) => screen.getByText(label, { selector: 'p, dt' }).nextElementSibling?.textContent;

const ready = async () => {
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
  return screen.getByLabelText('量った重さ', { exact: false, selector: 'input' });
};

describe('meat yield', () => {
  beforeEach(() => {
    useMeatYieldStore.setState(useMeatYieldStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
    useLanguageStore.setState({ language: 'ja' });
  });

  it('renders the calculator before the saved settings are read, held busy and silent', () => {
    const { container } = render(<MeatYieldClient />);
    const busy = container.querySelector('[aria-busy="true"]');
    expect(busy).toContainElement(screen.getByLabelText('量った重さ', { exact: false, selector: 'input' }));
    expect(busy).toContainElement(screen.getByRole('heading', { name: '各段階の重さの目安' }));
    for (const region of spokenRegions()) expect(region).toBeEmptyDOMElement();
  });

  it('puts the answer straight after the weight, before the shares', async () => {
    render(<MeatYieldClient />);
    await ready();
    const answer = screen.getByRole('heading', { name: '各段階の重さの目安' });
    expect(screen.getByRole('heading', { name: '量った重さ' }).compareDocumentPosition(answer)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(answer.compareDocumentPosition(screen.getByRole('heading', { name: '歩留まりの割合' }))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('opens on a 30 kg deer with the MAFF reference shares', async () => {
    render(<MeatYieldClient />);
    await ready();
    // 30 kg × 20 % = 6 kg of meat; 30 kg × 50 % = 15 kg of carcass.
    expect(figure('食肉にできる部位')).toBe('6kg');
    expect(figure('枝肉')).toBe('15kg');
    // Beside the meat weight: a weight, not a verdict on the meat.
    expect(screen.getByText('食肉にできる部位', { selector: 'p' }).closest('div')?.parentElement).toHaveTextContent(
      '食用に適するかどうかは判定しません。',
    );
    expect(figure('全体重')).toBe('30kg');
    expect(figure('内臓摘出後')).toBe('—');
    expect(screen.getByLabelText('枝肉の割合', { exact: false })).toHaveValue(50);
    expect(screen.getByLabelText('内臓摘出後の割合', { exact: false })).toHaveValue(null);
    expect(
      screen.getAllByText(/農林水産省「野生鳥獣被害防止マニュアル【総合対策編】」令和5年3月/).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/確認日 2026-09-23/)).toBeInTheDocument();
    await waitFor(
      () => {
        const summary = spokenRegions()[1];
        if (!summary) throw new Error('Expected the settled summary region.');
        expect(summary.textContent).toBe('食肉にできる部位は約 6 kg（全体重 30 kg）。');
      },
      { timeout: 2000 },
    );
  });

  it('takes a carcass weight back to the whole animal', async () => {
    render(<MeatYieldClient />);
    await ready();
    fireEvent.click(screen.getByRole('radio', { name: '枝肉' }));
    fireEvent.change(screen.getByLabelText('量った重さ', { exact: false, selector: 'input' }), {
      target: { value: '20' },
    });
    // 20 kg ÷ 50 % = 40 kg whole; 40 × 20 % = 8 kg.
    expect(figure('全体重')).toBe('40kg');
    expect(figure('食肉にできる部位')).toBe('8kg');
  });

  it('puts in the boar shares and leaves the unpublished ones blank', async () => {
    render(<MeatYieldClient />);
    await ready();
    fireEvent.click(screen.getByRole('radio', { name: 'イノシシ' }));
    expect(screen.getByLabelText('食肉にできる部位の割合', { exact: false })).toHaveValue(30);
    expect(screen.getByLabelText('枝肉の割合', { exact: false })).toHaveValue(null);
    // 30 kg × 30 % = 9 kg.
    expect(figure('食肉にできる部位')).toBe('9kg');
    expect(figure('枝肉')).toBe('—');
    fireEvent.click(screen.getByRole('radio', { name: '枝肉' }));
    expect(screen.getByText('枝肉の割合を入力してください。')).toBeInTheDocument();
    expect(figure('食肉にできる部位')).toBe('—');
  });

  it('explains a share out of order beside both fields', async () => {
    render(<MeatYieldClient />);
    await ready();
    fireEvent.change(screen.getByLabelText('食肉にできる部位の割合', { exact: false }), { target: { value: '60' } });
    expect(screen.getAllByText('食肉にできる部位の割合は、枝肉の割合以下にしてください。')).toHaveLength(2);
    expect(figure('食肉にできる部位')).toBe('—');
    fireEvent.click(screen.getByRole('button', { name: 'シカの参考値に戻す' }));
    expect(figure('食肉にできる部位')).toBe('6kg');
  });

  it('counts packs and the share of a freezer given by weight', async () => {
    render(<MeatYieldClient />);
    await ready();
    const section = screen.getByRole('button', { name: /パック数と冷凍庫/ });
    expect(section).toHaveTextContent('500 g ずつで 12 パック');
    fireEvent.click(section);
    fireEvent.change(screen.getByLabelText('冷凍庫に入る肉の重さ', { exact: false }), { target: { value: '30' } });
    // 6 kg of 30 kg is 20 %, and five animals of this size fit.
    expect(section).toHaveTextContent('500 g ずつで 12 パック・冷凍庫の 20 %');
    expect(screen.getByText('この大きさなら 5 頭分まで入ります。')).toBeInTheDocument();
    // 6 kg in 5.99 kg is 100.17 %: shown as 101 %, never 100 %, beside the word that it does not fit.
    fireEvent.change(screen.getByLabelText('冷凍庫に入る肉の重さ', { exact: false }), { target: { value: '5.99' } });
    expect(section).toHaveTextContent('冷凍庫の 101 %');
    expect(screen.getByText('1 頭分が入りきりません。')).toBeInTheDocument();
  });

  it('goes back to the defaults after asking', async () => {
    render(<MeatYieldClient />);
    await ready();
    fireEvent.click(screen.getByRole('radio', { name: 'イノシシ' }));
    fireEvent.click(screen.getByRole('button', { name: '入力を初期値に戻す' }));
    fireEvent.click(await screen.findByRole('button', { name: '初期値に戻す' }));
    expect(screen.getByRole('radio', { name: 'シカ' })).toBeChecked();
    expect(figure('食肉にできる部位')).toBe('6kg');
  });

  it('reads out in English once the language changes', async () => {
    render(<MeatYieldClient />);
    await ready();
    act(() => useLanguageStore.getState().setLanguage('en'));
    expect(figure('Usable meat')).toBe('6kg');
    expect(screen.getByRole('radio', { name: 'Wild boar' })).toBeInTheDocument();
    await waitFor(
      () => {
        const summary = spokenRegions()[1];
        if (!summary) throw new Error('Expected the settled summary region.');
        expect(summary.textContent).toBe('About 6 kg of usable meat (whole animal 30 kg).');
      },
      { timeout: 2000 },
    );
  });

  it('owns up to saved data it could not read and starts from the defaults', async () => {
    window.localStorage.setItem(storageKey, JSON.stringify({ state: { settings: { species: 'bear' } }, version: 0 }));
    render(<MeatYieldClient />);
    await ready();
    expect(screen.getAllByText(discardedSaveMessage('ja')).length).toBeGreaterThan(0);
    expect(figure('食肉にできる部位')).toBe('6kg');
  });

  it('restores what was saved', async () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        state: {
          settings: {
            species: 'boar',
            stage: 'whole',
            weightKg: 60,
            ratios: { dressed: null, carcass: null, meat: 30 },
            packGrams: 1000,
            freezerKg: null,
          },
        },
        version: 0,
      }),
    );
    render(<MeatYieldClient />);
    await ready();
    // 60 kg × 30 % = 18 kg.
    expect(figure('食肉にできる部位')).toBe('18kg');
    expect(screen.getByRole('button', { name: /パック数と冷凍庫/ })).toHaveTextContent('1,000 g ずつで 18 パック');
  });
});
