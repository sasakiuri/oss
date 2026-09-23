import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { STORAGE_KEY, useHuntingHoursStore } from '@/app/(standalone)/labs/hunting-hours/_store';
import { HuntingHoursClient } from '@/app/(standalone)/labs/hunting-hours/hunting-hours-client';
import { useStorageStatus } from '@/lib/browser-storage';
import { useLanguageStore } from '@/store';

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

// The page carries two sr-only paragraphs, the discarded-save notice and the settled summary, kept
// apart because a status region is atomic and sharing one would repeat the notice on every summary
// change. The saved-places card holds another region, a div, which these helpers must not pick up.
const spokenRegions = () =>
  screen.getAllByRole('status').filter((node) => node.tagName === 'P' && node.className.includes('sr-only'));
// Named by position rather than counted from the end, so a third one cannot quietly
// take a name and leave every assertion looking at the wrong text.
const noticeRegion = () => spokenRegions()[0];
const statusRegion = () => spokenRegions()[1];
// The saved places sit in a section that opens on request. Hidden content is not in the
// accessibility tree, so a role query needs it open, as a reader would have it.
const openSaved = () => fireEvent.click(screen.getByRole('button', { name: /^保存した地点/ }));
// The coordinate fields are shown only once the place is no longer a prefecture.
const enterCoordinates = () => fireEvent.change(screen.getByLabelText('都道府県'), { target: { value: 'custom' } });
const announced = () => waitFor(() => expect(statusRegion()?.textContent).toBeTruthy(), { timeout: 3000 });

// The tool renders from the first paint, held busy until the saved state is read; act only after that.
const loaded = async <T,>(find: () => Promise<T>) => {
  const element = await find();
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
  return element;
};

describe('announcing the hours of a day', () => {
  beforeEach(() => {
    // persist writes through every setState, so the store is reset before the clear.
    useHuntingHoursStore.setState(useHuntingHoursStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
    // The language is the site's now, so it outlives this store's reset.
    useLanguageStore.setState({ language: 'ja' });
    // A fixed day keeps the summary the same whatever day the suite runs on.
    window.history.replaceState(null, '', '/labs/hunting-hours?date=2026-06-21');
  });
  afterEach(() => {
    vi.useRealTimers();
    // One test replaces navigator wholesale, and the replacement is missing everything that lives
    // on the prototype; another makes the browser refuse every write. Both are put back rather
    // than left for whatever is written next.
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('has its region on the page before the saved settings are read', () => {
    const { container } = render(<HuntingHoursClient />);
    // Rendered with the defaults and held busy until the saved settings are read. The region has
    // to be here already, and empty, or the first message it receives is never announced.
    expect(container.querySelector('[aria-busy="true"]')).toContainElement(screen.getByLabelText('日付'));
    expect(spokenRegions()).toHaveLength(2);
    for (const region of spokenRegions()) expect(region.textContent).toBe('');
  });

  it('is read in the language of the interface', async () => {
    render(<HuntingHoursClient />);
    await loaded(() => screen.findByLabelText('日付'));
    // Outside every element that carries lang, so each states its own. Counted first, or a loop
    // over nothing would pass while no region is on the page at all.
    expect(spokenRegions()).toHaveLength(2);
    for (const region of spokenRegions()) expect(region).toHaveAttribute('lang', 'ja');
    act(() => useLanguageStore.getState().setLanguage('en'));
    for (const region of spokenRegions()) expect(region).toHaveAttribute('lang', 'en');
  });

  it('waits for the typing to settle instead of reading out every keystroke', async () => {
    render(<HuntingHoursClient />);
    await announced();
    enterCoordinates();
    const latitude = screen.getByLabelText('緯度', { exact: false });
    const before = statusRegion()?.textContent;
    vi.useFakeTimers();
    fireEvent.change(latitude, { target: { value: '7' } });
    fireEvent.change(latitude, { target: { value: '78' } });
    fireEvent.change(latitude, { target: { value: '78.22' } });
    expect(statusRegion()?.textContent).toBe(before);
    act(() => vi.advanceTimersByTime(700));
    // The June solstice at 78 N has no sunset at all, so the sentence cannot match Tokyo's.
    expect(statusRegion()?.textContent).toBe('この日は太陽が沈みません。');
  });

  it('has the result region on the page before there is a result to put in it', async () => {
    render(<HuntingHoursClient />);
    const nameField = await loaded(() => screen.findByLabelText('地点名'));
    openSaved();
    // Empty, the region is out of flow so the card reserves no room for it, which is why it
    // cannot be picked out by class here. What matters is that the node already exists.
    const before = screen.getAllByRole('status').filter((node) => node.textContent === '');
    expect(before.length).toBeGreaterThan(0);
    fireEvent.change(nameField, { target: { value: '猟場' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    const region = screen.getAllByRole('status').find((node) => node.textContent === '保存しました。');
    // The same node has to receive the text, or the first message of a visit is never announced.
    expect(before).toContain(region);
  });

  it('announces a deletion and its undo from that same region', async () => {
    render(<HuntingHoursClient />);
    fireEvent.change(await loaded(() => screen.findByLabelText('地点名')), { target: { value: '猟場' } });
    openSaved();
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    const region = screen.getAllByRole('status').find((node) => node.textContent === '保存しました。');
    expect(region).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '「猟場」を削除' }));
    expect(region?.textContent).toContain('「猟場」を削除しました。');
    fireEvent.click(screen.getByRole('button', { name: '元に戻す' }));
    expect(region?.textContent).toBe('元に戻しました。');
  });

  it('restates a standing message in the language chosen after it appeared', async () => {
    render(<HuntingHoursClient />);
    fireEvent.change(await loaded(() => screen.findByLabelText('地点名')), { target: { value: '猟場' } });
    openSaved();
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    const region = screen.getAllByRole('status').find((node) => node.textContent === '保存しました。');
    expect(region).toBeDefined();
    // The card takes its lang from the wrapper, which follows the switch. Text fixed at the moment
    // it was written would be left claiming a language it is not in.
    act(() => useLanguageStore.getState().setLanguage('en'));
    expect(region?.textContent).toBe('Saved.');
  });

  it('keeps a message that arrives while a deletion can still be undone', async () => {
    render(<HuntingHoursClient />);
    fireEvent.change(await loaded(() => screen.findByLabelText('地点名')), { target: { value: '猟場' } });
    openSaved();
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    fireEvent.click(screen.getByRole('button', { name: '「猟場」を削除' }));
    // Saving does not take the offer to undo away, so it and the new result stand together.
    fireEvent.change(screen.getByLabelText('地点名'), { target: { value: '別の猟場' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    const region = screen.getAllByRole('status').find((node) => node.textContent?.includes('保存しました。'));
    expect(region?.textContent).toContain('「猟場」を削除しました。');
    expect(screen.getByRole('button', { name: '元に戻す' })).toBeInTheDocument();
  });

  it('carries the discarded notice, which the visible one cannot announce', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { language: 'fr' }, version: 0 }));
    render(<HuntingHoursClient />);
    await waitFor(() => expect(noticeRegion()?.textContent).toBeTruthy(), { timeout: 3000 });
    expect(noticeRegion()?.textContent).toBe('保存されていた設定を読み取れなかったため、初期値で開いています。');
    // The summary keeps its own region, so the notice is not read out again on every change.
    // Waited for on purpose: an empty summary would pass this without saying anything about mixing.
    await waitFor(() => expect(statusRegion()?.textContent).toBeTruthy(), { timeout: 3000 });
    expect(statusRegion()?.textContent).not.toContain('読み取れなかった');
  });

  it('says a restored place did not reach this device when the write is refused', async () => {
    render(<HuntingHoursClient />);
    fireEvent.change(await loaded(() => screen.findByLabelText('地点名')), { target: { value: '猟場' } });
    openSaved();
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    fireEvent.click(screen.getByRole('button', { name: '「猟場」を削除' }));
    // The delete wrote too and failed, so the flag is put back: what is under test is the write
    // that restoring does, not the one before it.
    act(() => useStorageStatus.setState({ available: true }));
    fireEvent.click(screen.getByRole('button', { name: '元に戻す' }));
    // The place is back on screen, but it is not on the device, and saying "Restored" alone would
    // leave the reader believing it would still be there tomorrow.
    expect(screen.getByRole('button', { name: '「猟場」を削除' })).toBeInTheDocument();
    expect(screen.getByText('端末に保存できませんでした。')).toBeInTheDocument();
  });

  it('leaves the chosen place alone when a position arrives after the reader has gone', async () => {
    let report: ((position: { coords: { latitude: number; longitude: number } }) => void) | null = null;
    vi.stubGlobal('navigator', {
      ...window.navigator,
      geolocation: { getCurrentPosition: (onPosition: typeof report) => void (report = onPosition) },
    });
    const { unmount } = render(<HuntingHoursClient />);
    await loaded(() => screen.findByLabelText('日付'));
    act(() => useHuntingHoursStore.getState().selectPreset('01'));
    fireEvent.click(screen.getByRole('button', { name: '現在地を使う' }));
    expect(report).not.toBeNull();
    unmount();
    // The store outlives the page, so a late answer here would overwrite what was saved and the
    // place the reader picked would be gone the next time they opened the tool.
    act(() => report!({ coords: { latitude: 35.0, longitude: 135.0 } }));
    expect(useHuntingHoursStore.getState().presetId).toBe('01');
    expect(useHuntingHoursStore.getState().latitude).toBe(43.0667);
  });
});

describe('the order of the page', () => {
  beforeEach(() => {
    useHuntingHoursStore.setState(useHuntingHoursStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
    useLanguageStore.setState({ language: 'ja' });
    window.history.replaceState(null, '', '/labs/hunting-hours?date=2026-06-21');
  });

  it('asks for the day and the place before the hours, and names both on the answer', async () => {
    render(<HuntingHoursClient />);
    await loaded(() => screen.findByLabelText('日付'));
    const headings = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent ?? '');
    expect(headings.slice(0, 2)).toEqual(['日付', '日出から日没まで']);
    // The place sits with the day, open from the start, so there is nothing to expand to reach it.
    expect(screen.getByLabelText('都道府県').closest('#place')).not.toBeNull();
    expect(screen.getByLabelText('都道府県')).toHaveValue('13');
    const caption = () => screen.getByRole('heading', { name: '日出から日没まで' }).nextElementSibling;
    expect(caption()).toHaveTextContent('2026年6月21日日曜日・東京都（東京）');
    // Typed coordinates have no name, so the caption gives the numbers the hours are for.
    enterCoordinates();
    fireEvent.change(screen.getByLabelText('緯度', { exact: false }), { target: { value: '36.5' } });
    expect(caption()).toHaveTextContent('緯度 36.5、経度 139.7414');
  });

  it('shows the coordinates of a prefecture and asks for them only when there is no prefecture', async () => {
    render(<HuntingHoursClient />);
    await loaded(() => screen.findByLabelText('日付'));
    expect(screen.queryByLabelText('緯度', { exact: false })).toBeNull();
    expect(screen.getByText('県庁所在地（緯度 35.6581、経度 139.7414）で計算します。')).toBeInTheDocument();
    enterCoordinates();
    // The fields start from the prefecture's point rather than from blank.
    expect(screen.getByLabelText('緯度', { exact: false })).toHaveValue(35.6581);
    fireEvent.change(screen.getByLabelText('緯度', { exact: false }), { target: { value: '200' } });
    expect(screen.getByText('緯度と経度を正しく入力してください。')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('都道府県'), { target: { value: '47' } });
    expect(screen.queryByLabelText('緯度', { exact: false })).toBeNull();
    expect(screen.getByText('05:38 – 19:24')).toBeInTheDocument();
  });

  it('shows the hours once, as a range, without repeating sunrise and sunset beside it', async () => {
    render(<HuntingHoursClient />);
    await loaded(() => screen.findByLabelText('日付'));
    expect(screen.getByText('04:26 – 19:00')).toBeInTheDocument();
    expect(screen.queryByText('04:26')).toBeNull();
    expect(screen.queryByText('19:00')).toBeNull();
  });

  it('names a saved place on the answer and counts it in its section once it is loaded', async () => {
    render(<HuntingHoursClient />);
    await loaded(() => screen.findByLabelText('日付'));
    enterCoordinates();
    fireEvent.change(screen.getByLabelText('緯度', { exact: false }), { target: { value: '36.5' } });
    openSaved();
    fireEvent.change(screen.getByLabelText('地点名'), { target: { value: '裏山' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByRole('button', { name: /^保存した地点/ })).toHaveTextContent('1 件');
    expect(screen.getByRole('heading', { name: '日出から日没まで' }).nextElementSibling).toHaveTextContent('裏山');
  });
});
