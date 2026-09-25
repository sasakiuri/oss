import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useShotGroupStore } from '@/app/(standalone)/labs/shot-group/_store';
import { ShotGroupClient } from '@/app/(standalone)/labs/shot-group/shot-group-client';
import { useStorageStatus } from '@/lib/browser-storage';
import type { ShotImpact } from '@/lib/schemas/shot-group';

// Only the shared chrome is stubbed: it needs the Next.js app router, which a unit render has not
// mounted. Every figure, wording and verdict below is the real one.
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

const store = () => useShotGroupStore.getState();
const record = (impacts: ShotImpact[]) => act(() => impacts.forEach((impact) => store().addImpactAtOffset(impact)));

/** Half a centimetre of scatter about a point 30 mm to the right of the aim point. */
const offsetToTheRight: ShotImpact[] = [
  { x: 30, y: 1 },
  { x: 31, y: -1 },
  { x: 29, y: 0 },
  { x: 30.5, y: 0.5 },
];

/** The same scatter, but centred: the four shots straddle the aim point on both axes. */
const centred: ShotImpact[] = [
  { x: -9, y: 8 },
  { x: 8, y: -7 },
  { x: -7, y: -9 },
  { x: 9, y: 7 },
];

const panel = async () => {
  // The heading is the button that opens the closed section, so its name runs on into the summary.
  const heading = await screen.findByRole('heading', { name: /^6\. 統計で確かめる/ });
  // The working sits in a closed section, so it is opened as a reader would before it is read.
  const toggle = within(heading).getByRole('button');
  if (toggle.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle);
  return heading.parentElement!;
};
/**
 * The tool keeps three hidden live regions: the discarded-save notice, the settled summary and the
 * one that reports an impact as it is added. The summary is the second, and they stay apart because
 * a status region is atomic and sharing one would read the others out again on every change.
 */
const spokenSummary = () =>
  screen.getAllByRole('status').filter((node) => node.tagName === 'P' && node.className.includes('sr-only'))[1]!;

describe('checking what a shot group settles', () => {
  beforeEach(() => {
    // persist writes on every set, so the reset comes first and the clear leaves storage truly empty.
    useShotGroupStore.setState(useShotGroupStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });

  it('renders the tool before the saved settings are read, held busy until then', async () => {
    const { container } = render(<ShotGroupClient />);
    expect(container.querySelector('[aria-busy="true"]')).toContainElement(
      screen.getByRole('heading', { name: '4. 着弾を記録する' }),
    );
    await panel();
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('says at the top when this browser cannot keep the settings', async () => {
    useStorageStatus.setState({ available: false, discarded: [] });
    render(<ShotGroupClient />);
    await panel();
    expect(
      screen
        .getAllByRole('status')
        .filter((node) => !node.closest('[hidden]'))
        .some((node) => node.textContent?.includes('このブラウザーでは設定を保存できません')),
    ).toBe(true);
  });

  it('waits for a second shot before judging anything', async () => {
    render(<ShotGroupClient />);
    await panel();
    // No impacts: one line, not a panel of empty figures.
    expect(screen.getByText('着弾がまだありません。')).toBeInTheDocument();
    expect(screen.queryByText('最大中心間距離')).not.toBeInTheDocument();
    expect(screen.queryByText('着弾を 2 発以上記録すると、補正してよいかを判定します。')).not.toBeInTheDocument();
    record([{ x: 30, y: 0 }]);
    expect(screen.getByText('着弾を 2 発以上記録すると、補正してよいかを判定します。')).toBeInTheDocument();
    // One shot leaves the axis table out entirely rather than printing an interval of nothing.
    expect(screen.queryByRole('row', { name: /上下/ })).not.toBeInTheDocument();
  });

  it('refuses to name a correction while the offsets stay within chance', async () => {
    render(<ShotGroupClient />);
    await panel();
    record(centred);
    expect(
      screen.getByText('上下・左右とも、狙点からのズレは偶然の範囲内です。この群では補正の向きを決められません。'),
    ).toBeInTheDocument();
    const rows = screen.getAllByRole('row', { name: /偶然の範囲/ });
    expect(rows).toHaveLength(2);
  });

  it('names the axis that is settled and leaves the other alone', async () => {
    render(<ShotGroupClient />);
    await panel();
    record(offsetToTheRight);
    expect(
      screen.getByText('左右のズレは偶然では説明できません。補正は左右だけにして、上下はそのままにしてください。'),
    ).toBeInTheDocument();
    const horizontal = screen.getByRole('row', { name: /^左右/ });
    expect(within(horizontal).getByText('偶然では説明できない')).toBeInTheDocument();
    // The interval is printed with the side it lies on, not as a signed number.
    expect(within(horizontal).getByText(/右 .+ 〜 右 /)).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /^上下/ })).getByText('偶然の範囲')).toBeInTheDocument();
  });

  it('turns the precision the reader wants into a number of shots', async () => {
    render(<ShotGroupClient />);
    await panel();
    record(offsetToTheRight);
    // The default target of ±10 mm is already met by this tight a group.
    expect(screen.getByText(/すでに足りています。/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/平均着弾点を決めたい精度/), { target: { value: '0.5' } });
    expect(screen.getByText(/合計 \d+ 発必要です。あと \d+ 発です。/)).toBeInTheDocument();
    // An angle needs the distance to become a length on the target, and the distance is set.
    fireEvent.change(screen.getByLabelText('目標の単位'), { target: { value: 'moa' } });
    expect(screen.getByLabelText(/平均着弾点を決めたい精度/)).toHaveValue(0.5);
    expect(screen.getByText(/この射距離では ±/)).toBeInTheDocument();
  });

  it('says how much the group size is worth, and how it grows with the shots', async () => {
    render(<ShotGroupClient />);
    await panel();
    record(centred);
    expect(screen.getByText('1 発のばらつき（σ）')).toBeInTheDocument();
    // Both σ and the mean radius are quoted with an interval rather than as a bare number.
    expect(screen.getAllByText(/95% 区間/)).toHaveLength(2);
    expect(screen.getByText('同じばらつきでの平均（発数別）')).toBeInTheDocument();
    const byGroupSize = screen.getByText(/3 発 .+ \/ 5 発 .+ \/ 10 発 /);
    expect(byGroupSize).toBeInTheDocument();
    // The published table has the extreme spread growing with every shot added.
    const sizes = byGroupSize.textContent!.match(/(\d+(?:\.\d+)?) mm/g)!.map((text) => Number.parseFloat(text));
    expect(sizes[0]).toBeLessThan(sizes[1]!);
    expect(sizes[1]).toBeLessThan(sizes[2]!);
  });

  it('warns when the group is too far from round for the model behind those figures', async () => {
    render(<ShotGroupClient />);
    await panel();
    record([
      { x: 0, y: -30 },
      { x: 1, y: 0 },
      { x: -1, y: 31 },
      { x: 0, y: -14 },
    ]);
    expect(screen.getByText(/縦と横のばらつきの差が大きい/)).toBeInTheDocument();
    // The verdicts do not rest on that model, and the warning has to say so.
    expect(screen.getByText(/判定と必要発数は影響を受けません。/)).toBeInTheDocument();
  });

  it('reads the verdict out with the figures, once the typing settles', async () => {
    vi.useFakeTimers();
    try {
      render(<ShotGroupClient />);
      await act(async () => {
        await useShotGroupStore.persist.rehydrate();
      });
      record(centred);
      expect(spokenSummary()).toBeEmptyDOMElement();
      act(() => vi.advanceTimersByTime(700));
      expect(spokenSummary().textContent).toContain('4 発。');
      expect(spokenSummary().textContent).toContain('ズレは偶然の範囲内で、補正の向きは決められません。');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('reading the group where it is recorded', () => {
  beforeEach(() => {
    useShotGroupStore.setState(useShotGroupStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });

  it('puts the result straight after the workspace, and says each figure once', async () => {
    render(<ShotGroupClient />);
    await panel();
    record([
      { x: 25, y: 0 },
      { x: -25, y: 0 },
    ]);
    const workspace = screen.getByRole('heading', { name: '4. 着弾を記録する' });
    const result = screen.getByRole('region', { name: '測定結果' });
    // The result follows the workspace in the reading order, which is where a phone stacks it.
    expect(workspace.compareDocumentPosition(result) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(result).getByText('最大中心間距離')).toBeInTheDocument();
    // The one-line summary under the workspace is gone: the spread is printed in the result alone.
    expect(screen.getAllByText('50 mm')).toHaveLength(1);
    expect(within(result).getByText('穴の中心間。1.72 MOA / 0.5 mil')).toBeInTheDocument();
  });

  it('folds the setup into lines that state the values in force', async () => {
    render(<ShotGroupClient />);
    await panel();
    const scale = screen.getByRole('button', { name: /^2\. 実寸を合わせる/ });
    const setup = screen.getByRole('button', { name: /^3\. 狙点・射距離・弾径/ });
    expect(scale).toHaveAttribute('aria-expanded', 'false');
    expect(setup).toHaveAttribute('aria-expanded', 'false');
    expect(scale).toHaveTextContent('A–B 100 mm（写真上 600 px、1 px = 0.1667 mm）');
    expect(setup).toHaveTextContent('射距離 100 m（1 MOA = 29.1 mm）・ 弾径 未入力');
    fireEvent.click(setup);
    fireEvent.change(screen.getByLabelText(/^弾径 \(/), { target: { value: '7.82' } });
    expect(setup).toHaveTextContent('弾径 7.82 mm');
  });

  it('keeps a step open while it holds something to fix, and says why nothing is measured', async () => {
    render(<ShotGroupClient />);
    await panel();
    record([{ x: 25, y: 0 }]);
    fireEvent.click(screen.getByRole('button', { name: /^2\. 実寸を合わせる/ }));
    fireEvent.change(screen.getByLabelText(/基準点 A–B の実寸/), { target: { value: '0' } });
    const scale = screen.getByRole('button', { name: /^2\. 実寸を合わせる/ });
    expect(scale).toHaveAttribute('aria-expanded', 'true');
    expect(scale).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('実寸の基準が未設定です。')).toBeInTheDocument();
  });

  it('asks for the bullet diameter ahead of the automatic reading that needs it', async () => {
    render(<ShotGroupClient />);
    await panel();
    const setup = screen.getByRole('heading', { name: /^3\. 狙点・射距離・弾径/ }).parentElement!;
    expect(within(setup).getByLabelText(/^弾径 \(mm\)/)).toBeInTheDocument();
    expect(screen.getByText('自動検出には写真・実寸の基準（手順 2）・弾径（手順 3）が必要です。')).toBeInTheDocument();
  });

  it('shows a lost save at the top rather than inside the closed records', async () => {
    useStorageStatus.setState({ available: true, discarded: ['nilay-labs-shot-group-v1'] });
    render(<ShotGroupClient />);
    await panel();
    const notice = screen
      .getAllByText('保存されていた設定を読み取れなかったため、初期値で開いています。')
      .find((node) => !node.className.includes('sr-only'))!;
    expect(notice.closest('[hidden]')).toBeNull();
    expect(notice.closest('section')).toBeNull();
  });
});
