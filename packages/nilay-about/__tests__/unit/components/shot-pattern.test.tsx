import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useShotPatternStore } from '@/app/(standalone)/labs/shot-pattern/_store';
import { ShotPatternClient } from '@/app/(standalone)/labs/shot-pattern/shot-pattern-client';
import { useStorageStatus } from '@/lib/browser-storage';

// Only the shared chrome is stubbed: it needs the Next.js app router, which a unit render has not mounted.
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

const store = () => useShotPatternStore.getState();
// Each result figure is its label followed by its value.
const value = (label: string) => screen.getByText(label, { selector: 'p' }).nextElementSibling!;

describe('counting a shot pattern', () => {
  beforeEach(() => {
    useShotPatternStore.setState(useShotPatternStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });

  it('says at the top when this browser cannot keep the settings', async () => {
    useStorageStatus.setState({ available: false, discarded: [] });
    render(<ShotPatternClient />);
    await screen.findByRole('heading', { name: '5. 結果' });
    // Rendered at once, held busy until the saved settings are read.
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
    expect(
      screen
        .getAllByRole('status')
        .filter((node) => !node.closest('[hidden]'))
        .some((node) => node.textContent?.includes('このブラウザーでは設定を保存できません')),
    ).toBe(true);
  });

  const renderWithShots = async () => {
    render(<ShotPatternClient />);
    await screen.findByRole('heading', { name: '5. 結果' });
    // Rendered at once, held busy until the saved settings are read.
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
    // One shot on the centre and one 50 cm out, beyond the 76.2 cm circle.
    act(() => {
      store().addShotAtOffset({ x: 0, y: 0 });
      store().addShotAtOffset({ x: 50, y: 0 });
    });
  };

  it('puts the result straight after the workspace, led by the pattern percentage', async () => {
    await renderWithShots();
    const workspace = screen.getByRole('heading', { name: '4. 着弾を数える' });
    const result = screen.getByRole('region', { name: '集計結果' });
    expect(workspace.compareDocumentPosition(result) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(value('パターン率')).toHaveTextContent('—');
    expect(within(result).getByText(/手順 3 で装弾の総粒数を入れると/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('装弾の総粒数'), { target: { value: '4' } });
    expect(value('パターン率')).toHaveTextContent('25%');
    expect(value('円内の着弾')).toHaveTextContent('1');
    expect(value('円外の着弾')).toHaveTextContent('1');
    // The counts are printed in the result alone, not again in a line under the workspace.
    expect(screen.queryByText(/打点 2 ・ 円内 1/)).not.toBeInTheDocument();
  });

  it('opens the circle and pellet count, and folds the scale into the line that states it', async () => {
    await renderWithShots();
    const circle = screen.getByRole('button', { name: /^3\. 円と総粒数/ });
    // The pellet count is not kept between visits, so the step that asks for it starts open.
    expect(circle).toHaveAttribute('aria-expanded', 'true');
    expect(circle).toHaveTextContent('直径 76.2 cm ・ 総粒数 未入力');
    fireEvent.change(screen.getByLabelText('装弾の総粒数'), { target: { value: '250' } });
    expect(circle).toHaveTextContent('直径 76.2 cm ・ 総粒数 250');
    const scale = screen.getByRole('button', { name: /^2\. 実寸を合わせる/ });
    expect(scale).toHaveAttribute('aria-expanded', 'false');
    // Closed, it states the length it assumes; the pixel figures are inside it and not repeated here.
    expect(scale).toHaveTextContent('A–B 76.2 cm');
    expect(scale).not.toHaveTextContent('px');
  });

  it('counts nothing without a circle rather than calling every shot a miss', async () => {
    await renderWithShots();
    fireEvent.change(screen.getByLabelText('装弾の総粒数'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText(/^円の直径/), { target: { value: '' } });
    expect(value('打点の総数')).toHaveTextContent('2');
    expect(value('円内の着弾')).toHaveTextContent('—');
    expect(value('円外の着弾')).toHaveTextContent('—');
    expect(value('パターン率')).toHaveTextContent('—');
    expect(screen.getByText('円の直径を入力してください（手順 3）。')).toBeInTheDocument();
    expect(screen.getByText('円の直径が未設定です。')).toBeInTheDocument();
    // A step with nothing usable in it cannot be folded away.
    expect(screen.getByRole('button', { name: /^3\. 円と総粒数/ })).toHaveAttribute('aria-disabled', 'true');
  });

  it('names the scale, not an empty circle, as what is missing', async () => {
    await renderWithShots();
    fireEvent.change(screen.getByLabelText(/^基準点 A–B の実寸/), { target: { value: '0' } });
    expect(screen.getByText('実寸の基準が未設定です。')).toBeInTheDocument();
    expect(screen.queryByText('円内に着弾がありません。')).not.toBeInTheDocument();
  });
});
