import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { storageKey, useVelocitySpreadStore } from '@/app/(standalone)/labs/velocity-spread/_store';
import { VelocitySpreadClient } from '@/app/(standalone)/labs/velocity-spread/velocity-spread-client';
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

const spokenRegions = () =>
  screen.getAllByRole('status').filter((node) => node.tagName === 'P' && node.className.includes('sr-only'));

/** The summary as it stands on the page, without the copy the status region settles on. */
const onPage = (text: string) => screen.queryAllByText(text).filter((node) => !node.className.includes('sr-only'));

const openingSummary =
  '10 発の平均 800.4 m/s、標準偏差 4.4 m/s（95 % 区間 3 m/s 〜 8 m/s）。600 m での縦の広がり（±1 偏差）は 9.8 cm。';

const settle = async () => {
  await screen.findByLabelText('初速の記録', { exact: false });
};

describe('what a string of velocities costs at distance', () => {
  beforeEach(() => {
    // persist writes on every set, so the reset comes first and the clear leaves storage truly empty.
    useVelocitySpreadStore.setState(useVelocitySpreadStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });

  it('has both regions on the page before there is anything to say', () => {
    const { container } = render(<VelocitySpreadClient />);
    // Rendered with the defaults, and held busy until the saved settings are read.
    expect(container.querySelector('[aria-busy="true"]')).toContainElement(
      screen.getByLabelText('初速の記録', { exact: false }),
    );
    const regions = spokenRegions();
    expect(regions).toHaveLength(2);
    for (const region of regions) {
      expect(region).toBeEmptyDOMElement();
      expect(region).toHaveAttribute('lang', 'ja');
    }
  });

  it('opens on a string of ten and says what it does and does not decide', async () => {
    render(<VelocitySpreadClient />);
    await settle();
    // The figures carry the summary; the sentence is only spoken, not repeated on the page.
    expect(onPage(openingSummary)).toHaveLength(0);
    expect(screen.getByText('4.4 m/s')).toBeInTheDocument();
    // The deviation is known to about a factor of two, and the screen leads with that.
    expect(screen.getByText('95 % 区間 3 m/s 〜 8 m/s')).toBeInTheDocument();
  });

  it('puts the measured extreme spread against what that deviation really produces', async () => {
    render(<VelocitySpreadClient />);
    await settle();
    expect(screen.getByText('14 m/s')).toBeInTheDocument();
    // Fourteen is the low side of normal for this deviation over ten shots, not a tight load.
    expect(screen.getByText('この SD なら 10 発で平均 16.7 m/s、95 % が 10.9 m/s 〜 23.6 m/s')).toBeInTheDocument();
  });

  it('says how many shots the deviation itself would take to pin down', async () => {
    const user = userEvent.setup();
    render(<VelocitySpreadClient />);
    await settle();
    expect(screen.getByText('±20 % には 53 発必要です（現在 10 発）。')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('標準偏差の目標精度', { exact: false }));
    await user.type(screen.getByLabelText('標準偏差の目標精度', { exact: false }), '5');
    await waitFor(() => expect(screen.getByText(/200 発を超えるため、実射では決まりません。/)).toBeInTheDocument());
  });

  it('parts the shots even at the zero distance, and widens with the range', async () => {
    render(<VelocitySpreadClient />);
    await settle();
    const table = screen.getByRole('table', { name: '距離ごとの縦の広がり' });
    const atZero = within(table).getByRole('row', { name: /^100 m/ });
    // The rifle is sighted in once, so the rounds do not agree even where it was zeroed.
    expect(within(atZero).getByText('0.2 cm')).toBeInTheDocument();
    const far = within(table).getByRole('row', { name: /^600 m/ });
    expect(within(far).getByText('9.8 cm')).toBeInTheDocument();
  });

  it('names what it could not read instead of quietly leaving it out', async () => {
    const user = userEvent.setup();
    render(<VelocitySpreadClient />);
    await settle();
    await user.clear(screen.getByLabelText('初速の記録', { exact: false }));
    await user.type(screen.getByLabelText('初速の記録', { exact: false }), '800 805 fps');
    await waitFor(() => expect(screen.getByText('読み取れない値: fps')).toBeInTheDocument());
    expect(screen.getByText('2 件を読み取りました（60 件まで）。', { exact: false })).toBeInTheDocument();
  });

  it('refuses to describe the spread of a single shot', async () => {
    const user = userEvent.setup();
    render(<VelocitySpreadClient />);
    await settle();
    await user.clear(screen.getByLabelText('初速の記録', { exact: false }));
    await user.type(screen.getByLabelText('初速の記録', { exact: false }), '800');
    await waitFor(() => expect(onPage('2 発以上の初速を入力してください。')).toHaveLength(1));
    expect(screen.queryByRole('table', { name: '距離ごとの縦の広がり' })).not.toBeInTheDocument();
    // The unit stays within reach, so it can be chosen before the table has anything in it.
    expect(screen.getByText('2 発以上の初速と、弾と照準の条件を入力してください。')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'inch' }));
    expect(useVelocitySpreadStore.getState().dropUnit).toBe('inch');
  });

  it('settles the spoken summary only once typing has stopped', async () => {
    vi.useFakeTimers();
    try {
      render(<VelocitySpreadClient />);
      await vi.waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
      expect(spokenRegions()[1]).toBeEmptyDOMElement();
      act(() => vi.advanceTimersByTime(700));
      expect(spokenRegions()[1]).toHaveTextContent(openingSummary);
    } finally {
      vi.useRealTimers();
    }
  });

  it('owns up to a saved string it could not read', async () => {
    reportDiscardedSave(storageKey);
    render(<VelocitySpreadClient />);
    await waitFor(() => expect(spokenRegions()[0]).toHaveTextContent(discardedSaveMessage('ja')));
  });

  it('says so when the browser will not keep the settings', async () => {
    useStorageStatus.setState({ available: false });
    render(<VelocitySpreadClient />);
    await settle();
    // Said where it is seen, not only in the notes, which start closed.
    expect(
      screen
        .getAllByText('このブラウザーでは設定を保存できません。次に開いたときは初期値に戻ります。')
        .filter((node) => !node.closest('[hidden]')),
    ).toHaveLength(1);
  });

  it('asks for the unit before the readings, and scrolls the table rather than the page', async () => {
    render(<VelocitySpreadClient />);
    const readings = await screen.findByLabelText('初速の記録', { exact: false });
    const unit = screen.getByRole('group', { name: '初速の単位' });
    expect(unit.compareDocumentPosition(readings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const region = screen.getByRole('region', { name: '距離ごとの縦の広がりの表' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(within(region).getByRole('table')).toBeInTheDocument();
  });

  it('rereads the same string in the unit picked beside it, without rewriting it', async () => {
    const user = userEvent.setup();
    render(<VelocitySpreadClient />);
    const readings = await screen.findByLabelText('初速の記録', { exact: false });
    const before = (readings as HTMLTextAreaElement).value;
    await user.click(within(screen.getByRole('group', { name: '初速の単位' })).getByText('fps'));
    expect(readings).toHaveValue(before);
    expect(readings).toHaveAccessibleName('初速の記録 (fps)');
    expect(screen.getByText('800.4 fps')).toBeInTheDocument();
  });

  it('leads with the deviation and folds the load and the air away with their values stated', async () => {
    render(<VelocitySpreadClient />);
    await settle();
    expect(screen.getByText('標準偏差 SD')).toBeInTheDocument();
    expect(screen.getByText('最大最小差 ES（10 発）')).toBeInTheDocument();
    const load = screen.getByRole('button', { name: /^弾と照準/ });
    expect(load).toHaveAttribute('aria-expanded', 'false');
    expect(load).toHaveTextContent('BC 0.45 (G1)・スコープ高 45 mm・ゼロイン 100 m・100 m 刻みで 600 m まで');
    expect(screen.getByRole('button', { name: /^大気条件/ })).toHaveTextContent(
      '15 °C・1,013.25 hPa・現地で測った気圧',
    );
    expect(screen.queryByRole('spinbutton', { name: /弾道係数/ })).toBeNull();
    // A field marked as wrong cannot stay folded away.
    act(() => useVelocitySpreadStore.getState().setBallisticCoefficient(5));
    expect(load).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('0.01 から 2 の間で入力してください。')).toBeInTheDocument();
  });
});
