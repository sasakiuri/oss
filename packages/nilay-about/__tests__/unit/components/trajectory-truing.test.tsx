import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { storageKey, useTruingStore } from '@/app/(standalone)/labs/trajectory-truing/_store';
import { TrajectoryTruingClient } from '@/app/(standalone)/labs/trajectory-truing/trajectory-truing-client';
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

const openingSummary =
  '弾道係数を 0.450 から 0.300 にすると実測に合います。どの群も許容 1 cm に収まるのは 0.296 から 0.304 までです。';

// The tool is on the page from the first render; it is settled once the saved settings are read.
const settle = () => waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());

/** The band under the fitted value, which the page shows in place of the spoken sentence. */
const openingBand = /^0\.296 〜 0\.304 ならどの群も 1 cm 以内/;
const bandOnPage = () => screen.queryAllByText(openingBand);

/** Text on the page, without the copy the status region settles on 700 ms later. */
const onPage = (text: string, options?: { exact: boolean }) =>
  screen.queryAllByText(text, options).filter((node) => !node.className.includes('sr-only'));

describe('fitting a trajectory to the groups that were fired', () => {
  beforeEach(() => {
    // persist writes on every set, so the reset comes first and the clear leaves storage truly empty.
    useTruingStore.setState(useTruingStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });

  it('has both regions on the page before there is anything to say', () => {
    const { container } = render(<TrajectoryTruingClient />);
    // Rendered with the defaults, and held busy until the saved settings are read.
    expect(container.querySelector('[aria-busy="true"]')).toContainElement(screen.getByLabelText('1 行目の射距離'));
    const regions = spokenRegions();
    expect(regions).toHaveLength(2);
    for (const region of regions) {
      expect(region).toBeEmptyDOMElement();
      expect(region).toHaveAttribute('lang', 'ja');
    }
  });

  it('opens on an example that a single coefficient explains', async () => {
    render(<TrajectoryTruingClient />);
    await settle();
    expect(bandOnPage()).toHaveLength(1);
    // The value that was entered and the value that fits, side by side.
    expect(screen.getByText('0.450')).toBeInTheDocument();
    expect(screen.getByText('0.300')).toBeInTheDocument();
  });

  it('shows what is left over at each distance, with its sign', async () => {
    render(<TrajectoryTruingClient />);
    await settle();
    const residuals = screen.getByRole('table', { name: '距離ごとの残差' });
    const row = within(residuals).getByRole('row', { name: /300 m/ });
    expect(within(row).getByText('57.5 cm')).toBeInTheDocument();
    // As entered the calculation shoots flatter than the rifle did, so the residual is negative.
    expect(within(row).getByText('-8.2 cm')).toBeInTheDocument();
    expect(within(row).getByText('-0.1 cm')).toBeInTheDocument();
  });

  it('names the figure it is holding fixed when the other one cannot do the job', async () => {
    const user = userEvent.setup();
    render(<TrajectoryTruingClient />);
    await settle();
    await user.click(screen.getByRole('radio', { name: '初速' }));
    await waitFor(() => expect(useTruingStore.getState().target).toBe('muzzle-speed'));
    // These drops were made by one coefficient, and a velocity alone does not reproduce them to
    // the centimetre: the two are nearly interchangeable over a span of distances, not exactly.
    // What is left over is small, which is the reason the screen names the other figure to check.
    expect(screen.getByText(/初速だけでは、入力した精度まで合わせられません。/)).toBeInTheDocument();
    expect(screen.getByText(/弾道係数、ゼロイン距離、距離の測り方/)).toBeInTheDocument();
    // The miss that decides it is the closest any velocity comes, not the least squares one.
    expect(screen.getByText(/最も近い 742 m\/s でも残差は最大 1.8 cm です。/)).toBeInTheDocument();
  });

  it('puts the fitted value into the load when asked, and then has nothing left to apply', async () => {
    const user = userEvent.setup();
    render(<TrajectoryTruingClient />);
    await settle();
    await user.click(screen.getByRole('button', { name: 'この値を使う' }));
    // What goes into the field is what the screen printed, not the eighteen digits behind it.
    await waitFor(() => expect(useTruingStore.getState().ballisticCoefficient).toBe(0.3));
    expect(screen.getByRole('button', { name: 'この値を使っています' })).toBeDisabled();
  });

  // Typing a distance and a drop re-solves once per keystroke, and each solve flies the bullet
  // some seventy times. That is real work rather than a wait, so this one test is given room.
  it('adds and removes a row, and keeps the answer while one is half typed', { timeout: 30_000 }, async () => {
    const user = userEvent.setup();
    render(<TrajectoryTruingClient />);
    await settle();
    await user.click(screen.getByRole('button', { name: '行を追加' }));
    // A row with nothing in it is not a shot that was fired, so the answer stays where it was.
    expect(bandOnPage()).toHaveLength(1);
    await user.type(screen.getByLabelText('3 行目の射距離'), '500');
    await user.type(screen.getByLabelText('3 行目の落差'), '300');
    await waitFor(() => expect(bandOnPage()).toHaveLength(0));
    await user.click(screen.getByRole('button', { name: '3 行目を削除' }));
    await waitFor(() => expect(bandOnPage()).toHaveLength(1));
  });

  it('puts the focus where the next keystroke belongs when rows come and go', { timeout: 15_000 }, async () => {
    const user = userEvent.setup();
    render(<TrajectoryTruingClient />);
    await settle();
    await user.click(screen.getByRole('button', { name: '行を追加' }));
    // Straight into the new row, rather than left on the button above an empty row.
    expect(screen.getByLabelText('3 行目の射距離')).toHaveFocus();
    // A removed row takes its button with it; the row that takes its place gets the focus.
    await user.click(screen.getByRole('button', { name: '1 行目を削除' }));
    expect(screen.getByRole('button', { name: '1 行目を削除' })).toHaveFocus();
    // Removing the last row hands the focus up to the row above.
    await user.click(screen.getByRole('button', { name: '2 行目を削除' }));
    expect(screen.getByRole('button', { name: '1 行目を削除' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: '1 行目を削除' }));
    expect(screen.getByRole('button', { name: '行を追加' })).toHaveFocus();
  });

  it('writes a residual that rounds to nothing as 0, without a sign', async () => {
    render(<TrajectoryTruingClient />);
    await settle();
    const residuals = screen.getByRole('table', { name: '距離ごとの残差' });
    const row = within(residuals).getByRole('row', { name: /400 m/ });
    expect(within(row).getByText('0 cm')).toBeInTheDocument();
    expect(within(residuals).queryByText(/^[+-]0 cm$/)).toBeNull();
  });

  it('rewrites the reading of the day when its unit changes, rather than rereading the number', async () => {
    const user = userEvent.setup();
    render(<TrajectoryTruingClient />);
    await settle();
    await user.selectOptions(screen.getByLabelText('気温の単位'), 'f');
    expect(useTruingStore.getState().atmosphere.temperature).toEqual({ value: 59, unit: 'f' });
    await user.selectOptions(screen.getByLabelText('気圧の単位'), 'inhg');
    expect(useTruingStore.getState().atmosphere.pressure).toEqual({ value: 29.921, unit: 'inhg' });
    // The answer is the same answer: the same day, said another way.
    expect(bandOnPage()).toHaveLength(1);
  });

  it('does not ask for a row when the rows it has cannot be worked out', async () => {
    const user = userEvent.setup();
    render(<TrajectoryTruingClient />);
    await settle();
    // A field cleared while the table is full: there are rows, and nothing to work them out with.
    await user.clear(screen.getByLabelText('ゼロイン距離', { exact: false }));
    await waitFor(() =>
      expect(
        screen.getByText('この弾が入力した距離まで届かないか、計算できない値です。', {
          exact: false,
        }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText('射距離と落差を 1 行以上入力してください。')).not.toBeInTheDocument();
  });

  it('says when one figure alone cannot explain the shots', async () => {
    const user = userEvent.setup();
    render(<TrajectoryTruingClient />);
    await settle();
    // Two groups at one distance that disagree by far more than the stated precision.
    const [first] = useTruingStore.getState().measurements;
    await user.clear(screen.getByLabelText('1 行目の落差'));
    await user.type(screen.getByLabelText('1 行目の落差'), '200');
    await waitFor(() => expect(useTruingStore.getState().measurements[0]?.drop).toBe(200));
    expect(first).toBeDefined();
    expect(screen.getByText(/弾道係数だけでは、入力した精度まで合わせられません。/)).toBeInTheDocument();
  });

  it('reads the measurements as angles when the shooter wrote them that way', async () => {
    const user = userEvent.setup();
    render(<TrajectoryTruingClient />);
    await settle();
    // Three short choices, shown side by side rather than behind a select.
    await user.click(screen.getByRole('radio', { name: 'mil' }));
    await waitFor(() => expect(useTruingStore.getState().reading).toBe('mil'));
    // The column now names the unit the numbers in it are read in.
    expect(screen.getByRole('columnheader', { name: '落差 (mil)' })).toBeInTheDocument();
  });

  it('opens the load while it is still the example, and folds it to one line once it is yours', async () => {
    const { unmount } = render(<TrajectoryTruingClient />);
    await settle();
    const load = () => screen.getByRole('button', { name: /^計算に使っている弾/ });
    // The example is someone else's load: it has to be filled in before the groups mean anything.
    expect(load()).toHaveAttribute('aria-expanded', 'true');
    expect(load()).toHaveTextContent('800 m/s・BC 0.450 G1・スコープ高 45 mm・ゼロイン 100 m');
    unmount();
    act(() => useTruingStore.getState().setMuzzleSpeed(812));
    render(<TrajectoryTruingClient />);
    await settle();
    expect(load()).toHaveAttribute('aria-expanded', 'false');
    // Closed, it still says what the calculation is assuming.
    expect(load()).toHaveTextContent('812 m/s・BC 0.450 G1');
    expect(screen.getByLabelText('初速 (m/s)')).not.toBeVisible();
  });

  it('keeps the numbers as typed when the length unit changes, and reads them anew', async () => {
    const user = userEvent.setup();
    render(<TrajectoryTruingClient />);
    await settle();
    await user.selectOptions(screen.getByLabelText('長さの単位'), 'inch');
    expect(useTruingStore.getState().tolerance).toBe(1);
    expect(useTruingStore.getState().measurements[0]?.drop).toBe(57.5);
    expect(screen.getByRole('columnheader', { name: '落差 (inch)' })).toBeInTheDocument();
  });

  it('takes the drops in inches from the unit choice above the table, not only from the precision field', async () => {
    const user = userEvent.setup();
    render(<TrajectoryTruingClient />);
    await settle();
    await user.click(screen.getByRole('radio', { name: 'inch' }));
    expect(useTruingStore.getState()).toMatchObject({ reading: 'offset', dropUnit: 'inch' });
    expect(screen.getByRole('columnheader', { name: '落差 (inch)' })).toBeInTheDocument();
    expect(screen.getByLabelText('長さの単位')).toHaveValue('inch');
    await user.click(screen.getByRole('radio', { name: 'MOA' }));
    expect(useTruingStore.getState()).toMatchObject({ reading: 'moa', dropUnit: 'inch' });
    await user.click(screen.getByRole('radio', { name: 'cm' }));
    expect(useTruingStore.getState()).toMatchObject({ reading: 'offset', dropUnit: 'cm' });
    expect(screen.getByRole('columnheader', { name: '落差 (cm)' })).toBeInTheDocument();
  });

  it('sets no figure in large type when the groups do not decide it', async () => {
    const user = userEvent.setup();
    render(<TrajectoryTruingClient />);
    await settle();
    // One group at the zero distance says the same thing about every load.
    await user.click(screen.getByRole('button', { name: '2 行目を削除' }));
    await user.clear(screen.getByLabelText('1 行目の射距離'));
    await user.type(screen.getByLabelText('1 行目の射距離'), '100');
    await user.clear(screen.getByLabelText('1 行目の落差'));
    await user.type(screen.getByLabelText('1 行目の落差'), '0');
    await waitFor(() => expect(onPage('この群からは弾道係数は決まりません。', { exact: false })).toHaveLength(1));
    const lead = screen.getByText(/^実測に合う弾道係数/, { selector: 'p' }).nextElementSibling;
    expect(lead).toHaveTextContent('—');
    // With nothing decided there is no value to hand over.
    expect(screen.getByRole('button', { name: /^この値を/ })).toBeDisabled();
  });

  it('settles the spoken summary only once typing has stopped', async () => {
    vi.useFakeTimers();
    try {
      render(<TrajectoryTruingClient />);
      await vi.waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
      expect(spokenRegions()[1]).toBeEmptyDOMElement();
      act(() => vi.advanceTimersByTime(700));
      expect(spokenRegions()[1]).toHaveTextContent(openingSummary);
    } finally {
      vi.useRealTimers();
    }
  });

  it('owns up to a saved measurement it could not read', async () => {
    reportDiscardedSave(storageKey);
    render(<TrajectoryTruingClient />);
    await waitFor(() => expect(spokenRegions()[0]).toHaveTextContent(discardedSaveMessage('ja')));
  });

  it('says so when the browser will not keep the settings', async () => {
    useStorageStatus.setState({ available: false });
    render(<TrajectoryTruingClient />);
    await settle();
    // Said where it is seen, not only in the notes, which start closed.
    expect(
      screen
        .getAllByText('このブラウザーでは設定を保存できません。次に開いたときは初期値に戻ります。')
        .filter((node) => !node.closest('[hidden]')),
    ).toHaveLength(1);
  });

  it('opens with the saved load folded, not with the example still showing', async () => {
    // A load saved on an earlier visit, while the page itself starts from the example.
    act(() => useTruingStore.getState().setMuzzleSpeed(812));
    const saved = window.localStorage.getItem(storageKey);
    if (saved === null) throw new Error('Expected the load to be saved.');
    useTruingStore.setState(useTruingStore.getInitialState(), true);
    window.localStorage.setItem(storageKey, saved);
    render(<TrajectoryTruingClient />);
    const load = screen.getByRole('button', { name: /^計算に使っている弾/ });
    // Before the saved state is read, the example is on the page and the section is open.
    expect(load).toHaveAttribute('aria-expanded', 'true');
    await settle();
    expect(screen.getByRole('button', { name: /^計算に使っている弾/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /^計算に使っている弾/ })).toHaveTextContent('812 m/s');
  });
});
