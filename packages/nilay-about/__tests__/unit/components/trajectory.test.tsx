import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { storageKey, useTrajectoryStore } from '@/app/(standalone)/labs/trajectory/_store';
import { TrajectoryClient } from '@/app/(standalone)/labs/trajectory/trajectory-client';
import { discardedSaveMessage } from '@/components/labs';
import { reportDiscardedSave, useStorageStatus } from '@/lib/browser-storage';

// Only the shared chrome is stubbed: it needs the Next.js app router, which a unit
// render has not mounted. The notice and its wording stay real.
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

// Two sr-only paragraphs: the discarded-save notice first and the settled summary last, kept apart
// because a status region is atomic and sharing one would repeat the notice on every change.
const spokenRegions = () =>
  screen.getAllByRole('status').filter((node) => node.tagName === 'P' && node.className.includes('sr-only'));

// The tool is on the page from the first render; it is settled once the saved settings are read.
const settled = () => waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());

// The hit probability and load comparison sections add tables of their own, so the distance table is
// found by the region that holds it.
const trajectoryTable = () =>
  within(screen.getByRole('region', { name: /Trajectory by distance|距離ごとの弾道の表/ })).getByRole('table');

describe('the trajectory tool on screen', () => {
  beforeEach(() => {
    // persist writes on every set, so the reset comes first and the clear leaves storage truly empty.
    useTrajectoryStore.setState(useTrajectoryStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });
  // Restoring here rather than at the end of a test: a failed assertion would otherwise leave
  // window.print mocked, and vi.spyOn hands back the same spy, calls and all, for the next test.
  afterEach(() => vi.restoreAllMocks());

  it('has both spoken regions on the page before there is anything to say', () => {
    const { container } = render(<TrajectoryClient />);
    // Rendered with the defaults, and held busy until the saved settings are read.
    expect(container.querySelector('[aria-busy="true"]')).toContainElement(screen.getByLabelText(/^初速 \(/));
    const regions = spokenRegions();
    expect(regions).toHaveLength(2);
    for (const region of regions) {
      expect(region).toBeEmptyDOMElement();
      expect(region).toHaveAttribute('lang', 'ja');
    }
  });

  it('prints a row for every step out to the furthest distance', async () => {
    render(<TrajectoryClient />);
    await settled();
    const table = trajectoryTable();
    // 50 m steps out to 500 m, plus the head row.
    expect(within(table).getAllByRole('row')).toHaveLength(11);
    expect(within(table).getByRole('rowheader', { name: '500' })).toBeInTheDocument();
    // Every column says which unit it is in, so no figure has to be guessed at.
    const heads = () =>
      within(trajectoryTable())
        .getAllByRole('columnheader')
        .map((head) => head.textContent);
    expect(heads()).toEqual(['距離m', '落差cm', '風偏cm', '残存速度m/s', 'エネルギーJ', '飛行時間s']);
    // Drop and drift come in the one unit the reader's sight is turned in.
    fireEvent.click(screen.getByRole('radio', { name: 'MOA' }));
    expect(heads()).toEqual(expect.arrayContaining(['落差MOA', '風偏MOA']));
    expect(heads()).not.toContain('落差cm');
    fireEvent.click(screen.getByRole('radio', { name: 'mil' }));
    expect(heads()).toEqual(expect.arrayContaining(['落差mil', '風偏mil']));
  });

  it('keeps the conditions most readers leave alone closed, saying what they assume', async () => {
    render(<TrajectoryClient />);
    await settled();
    const atmosphere = screen.getByRole('button', { name: /^大気/ });
    expect(atmosphere).toHaveAttribute('aria-expanded', 'false');
    expect(atmosphere).toHaveTextContent('15 °C');
    expect(screen.getByLabelText(/^気温 \(/)).not.toBeVisible();
    fireEvent.click(atmosphere);
    expect(screen.getByLabelText(/^気温 \(/)).toBeVisible();
    // A field marked as wrong cannot be folded out of sight.
    fireEvent.change(screen.getByLabelText(/^気温 \(/), { target: { value: '99' } });
    fireEvent.click(atmosphere);
    expect(screen.getByLabelText(/^気温 \(/)).toBeVisible();
  });

  it('answers with the drop at the zero and the point blank range', async () => {
    render(<TrajectoryClient />);
    await settled();
    // A 100 m zero puts the bullet on the sight line there, and the figures read in whole units.
    expect(screen.getByText('銃口エネルギー')).toBeInTheDocument();
    expect(screen.getByText('最大直接照準距離（無風）')).toBeInTheDocument();
    expect(screen.getByText('照準線との交点')).toBeInTheDocument();
    const [, summary] = spokenRegions();
    if (!summary) throw new Error('Expected the settled summary region.');
    await waitFor(() => expect(summary.textContent).toContain('ゼロインで、500 m の落差は'), { timeout: 2000 });
    expect(summary.textContent).toContain('無風での最大直接照準距離は');
  });

  it('explains an unusable coefficient beside its own field', async () => {
    render(<TrajectoryClient />);
    const field = await screen.findByLabelText(/^弾道係数 BC/);
    fireEvent.change(field, { target: { value: '' } });
    expect(await screen.findByText('0.01 から 2 の範囲で入力してください。')).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    // Said wherever an answer would have been: the summary, the table and the card.
    expect(screen.getAllByText('エラーのある欄を直してください。')[0]).toBeVisible();
    fireEvent.change(field, { target: { value: '0.5' } });
    await waitFor(() => expect(trajectoryTable()).toBeInTheDocument());
  });

  it('rewrites a measured value when its unit changes, so the load stays the same load', async () => {
    render(<TrajectoryClient />);
    await settled();
    fireEvent.change(screen.getByLabelText('初速の単位'), { target: { value: 'fps' } });
    fireEvent.change(screen.getByLabelText('重量の単位'), { target: { value: 'grain' } });
    fireEvent.change(screen.getByLabelText('スコープ高の単位'), { target: { value: 'inch' } });
    fireEvent.change(screen.getByLabelText('風速の単位'), { target: { value: 'mph' } });
    fireEvent.change(screen.getByLabelText('気温の単位'), { target: { value: 'f' } });
    const state = useTrajectoryStore.getState();
    expect(state.muzzleSpeed).toEqual({ value: 2624.7, unit: 'fps' });
    expect(state.mass).toEqual({ value: 168.21, unit: 'grain' });
    expect(state.sightHeight).toEqual({ value: 1.575, unit: 'inch' });
    expect(state.wind.speed).toBe(8.9);
    expect(state.atmosphere.temperature).toEqual({ value: 59, unit: 'f' });
    // The same load, so the same energy to the joule: 800 read as fps would be a far slower load.
    expect(screen.getByText('銃口エネルギー').parentElement?.textContent).toContain('3,488 J');
  });

  it('says the zero cannot be reached instead of asking for figures that are there', async () => {
    render(<TrajectoryClient />);
    await settled();
    fireEvent.change(screen.getByLabelText(/^ゼロイン距離/), { target: { value: '5000' } });
    const messages = screen.getAllByText(/この弾は 5,000 m まで届かないか、その距離でゼロインできません。/);
    // The result and the card each say it where their answer would have been.
    expect(messages.length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/エラーのある欄を直してください/)).toBeNull();
    // The print button goes to the zero, the field that is in the way.
    vi.spyOn(window, 'print').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: 'カードを印刷する' }));
    expect(screen.getByLabelText(/^ゼロイン距離/)).toHaveFocus();
    expect(window.print).not.toHaveBeenCalled();
  });

  it('works nothing out from a value the form has marked as wrong', async () => {
    render(<TrajectoryClient />);
    await settled();
    fireEvent.change(screen.getByLabelText(/^弾道係数 BC/), { target: { value: '5' } });
    expect(screen.queryByRole('table')).toBeNull();
    // In place of the figures, the result says which fields to fix.
    expect(screen.queryByText('3,488 J')).toBeNull();
    expect(screen.getAllByText(/エラーのある欄を直してください/).length).toBeGreaterThan(0);
  });

  it('shows only the fields the chosen pressure source reads', async () => {
    render(<TrajectoryClient />);
    await settled();
    // A pressure read at the firing point already carries the height, so no altitude is asked for.
    expect(screen.getByLabelText(/^気圧 \(/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^標高 \(/)).toBeNull();
    // A sea level reading is the one that needs the height, so both are on screen together.
    fireEvent.change(screen.getByLabelText('気圧の求め方'), { target: { value: 'sea-level' } });
    expect(screen.getByLabelText(/^気圧 \(/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^標高 \(/)).toBeInTheDocument();
    // With no reading at all there is nothing to enter but the height.
    fireEvent.change(screen.getByLabelText('気圧の求め方'), { target: { value: 'altitude' } });
    expect(screen.queryByLabelText(/^気圧 \(/)).toBeNull();
    expect(screen.getByLabelText(/^標高 \(/)).toBeInTheDocument();
  });

  it('prints what the card was worked out from, whatever columns are chosen', async () => {
    render(<TrajectoryClient />);
    await settled();
    const conditions = () => screen.getByRole('img', { name: '印刷するカードのプレビュー' }).textContent ?? '';
    expect(conditions()).toContain('初速 800 m/s');
    expect(conditions()).toContain('BC 0.45 G1');
    expect(conditions()).toContain('ゼロイン 100 m');
    // A card of bare numbers cannot be told from a card for another load, so there is no
    // control that takes the conditions off: adding and removing columns leaves them there.
    fireEvent.click(screen.getByLabelText('残存エネルギー'));
    expect(conditions()).toContain('BC 0.45 G1');
    fireEvent.click(screen.getByLabelText('残存エネルギー'));
    expect(conditions()).toContain('BC 0.45 G1');
    expect(screen.queryByLabelText(/前提/)).toBeNull();
  });

  it('reads the drift column per unit of wind when that is what was asked for', async () => {
    render(<TrajectoryClient />);
    await settled();
    const card = () => screen.getByRole('img', { name: '印刷するカードのプレビュー' }).textContent ?? '';
    expect(card()).toContain('風 4 m/s 9 時');
    fireEvent.change(screen.getByLabelText('風偏の列'), { target: { value: 'per-speed' } });
    // The heading says what the column is per, and the conditions say which wind it is.
    expect(card()).toContain('風偏 cm/m/s');
    expect(card()).toContain('風偏は真横（9 時）の風 1 m/s あたり');
    fireEvent.change(screen.getByLabelText('風偏の列'), { target: { value: 'none' } });
    expect(card()).not.toContain('風偏');
  });

  it('gives the card its own step and range, apart from the table', async () => {
    render(<TrajectoryClient />);
    await settled();
    const table = trajectoryTable();
    // The table opens at 50 m steps to 500 m and the card at 50 m steps to 300 m.
    expect(within(table).getByRole('rowheader', { name: '500' })).toBeInTheDocument();
    const card = screen.getByRole('img', { name: '印刷するカードのプレビュー' });
    expect(card.textContent).toContain('300');
    expect(card.textContent).not.toContain('500');
    fireEvent.change(screen.getByLabelText(/^カードの最大距離 \(/), { target: { value: '400' } });
    expect(screen.getByRole('img', { name: '印刷するカードのプレビュー' }).textContent).toContain('400');
    // The table is untouched by the card's own range.
    expect(within(trajectoryTable()).getByRole('rowheader', { name: '500' })).toBeInTheDocument();
  });

  it('says why a card cannot be printed rather than shrinking it to fit', async () => {
    render(<TrajectoryClient />);
    await settled();
    fireEvent.change(screen.getByLabelText(/^カードの距離の刻み \(/), { target: { value: '10' } });
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('行までです');
    // Nothing is printed while it does not fit, so no card can leave with rows missing.
    expect(screen.queryByRole('img', { name: '印刷するカードのプレビュー' })).toBeNull();
    fireEvent.change(screen.getByLabelText(/^カードの距離の刻み \(/), { target: { value: '50' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('img', { name: '印刷するカードのプレビュー' })).toBeInTheDocument();
  });

  it('leaves the browser\u2019s own print command printing the page', async () => {
    const { container } = render(<TrajectoryClient />);
    await settled();
    // The card is ready to print, and the page is still what a print of the page gives: the
    // table is this tool\u2019s output, and a card of six rows is not a replacement for it.
    expect(screen.getByRole('img', { name: '印刷するカードのプレビュー' })).toBeInTheDocument();
    expect(container.querySelector('div[lang="ja"]')?.className).not.toContain('print:hidden');
    expect(container.querySelector('svg[width="210mm"]')).toBeNull();
  });

  it('prints the sheet of cards only when the button asks for it', async () => {
    const { container } = render(<TrajectoryClient />);
    await settled();
    // What the printer would have been given, read at the moment the dialog was opened.
    let sheetWhilePrinting: Element | null = null;
    let pageHiddenWhilePrinting: string | undefined;
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      sheetWhilePrinting = container.querySelector('svg[width="210mm"]');
      pageHiddenWhilePrinting = container.querySelector('div[lang="ja"]')?.className;
    });
    fireEvent.click(screen.getByRole('button', { name: 'カードを印刷する' }));
    expect(print).toHaveBeenCalledTimes(1);
    // The sheet was on the page, at its real size, and the page itself was kept from the printer.
    expect(sheetWhilePrinting).not.toBeNull();
    expect(pageHiddenWhilePrinting).toContain('print:hidden');
    // The dialog is done with, so the page is back to printing as the page.
    await waitFor(() => expect(container.querySelector('div[lang="ja"]')?.className).not.toContain('print:hidden'));
    expect(container.querySelector('svg[width="210mm"]')).toBeNull();
  });

  it('moves to the field to fix instead of printing a card that does not fit', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<TrajectoryClient />);
    await settled();
    const stepField = screen.getByLabelText(/^カードの距離の刻み \(/);
    fireEvent.change(stepField, { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'カードを印刷する' }));
    expect(print).not.toHaveBeenCalled();
    expect(screen.getByLabelText('カードの大きさ')).toHaveFocus();
    fireEvent.change(stepField, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'カードを印刷する' }));
    expect(print).not.toHaveBeenCalled();
    expect(stepField).toHaveFocus();
  });

  it('keeps the notice out of the summary, so a new result does not repeat it', async () => {
    render(<TrajectoryClient />);
    await settled();
    const [notice, summary] = spokenRegions();
    if (!notice || !summary) throw new Error('Expected the two spoken regions.');
    act(() => reportDiscardedSave(storageKey));
    await waitFor(() => expect(notice).toHaveTextContent(discardedSaveMessage('ja')));
    await waitFor(() => expect(summary.textContent).toContain('無風での最大直接照準距離は'), { timeout: 2000 });
    // The summary carries the result alone: an atomic region holding both would read the notice
    // out again every time a figure changes.
    expect(summary.textContent).not.toContain('読み取れなかった');
  });

  it('says nothing about another tool losing its saved data', async () => {
    reportDiscardedSave('nilay-labs-hunting-hours-v1');
    render(<TrajectoryClient />);
    await settled();
    expect(screen.queryByText(/読み取れなかったため/)).toBeNull();
  });
});
