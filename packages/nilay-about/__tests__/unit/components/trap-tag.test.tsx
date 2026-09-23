import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TRAP_TAG_STORAGE_KEY, useTrapTagStore } from '@/app/(standalone)/labs/trap-tag/_store';
import { TrapTagClient } from '@/app/(standalone)/labs/trap-tag/trap-tag-client';
import { TrapTagSheet } from '@/app/(standalone)/labs/trap-tag/trap-tag-sheet';
import { discardedSaveMessage } from '@/components/labs';
import { reportDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { emptyTrapTagDraft } from '@/lib/schemas/trap-tag';
import { TRAP_TAG_CHAR_SIZES_MM, countCharacters, getTrapTagLayout } from '@/lib/trap-tag';
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

const sheetMarkup = (values: string[], charSizeMm: number, copies: number) =>
  renderToStaticMarkup(
    <TrapTagSheet layout={getTrapTagLayout({ values, charSizeMm, copies })} note="50 mm" label="preview" />,
  );

const ADDRESS = '東京都千代田区霞が関1-2-2';

// Three sr-only paragraphs sit above the cards, kept apart because a status region is atomic and
// sharing one would repeat every message on each change of the others.
// The save card's notice is excluded by its aria-live, which is the only region that states its own.
const spokenRegions = () =>
  screen
    .getAllByRole('status')
    .filter((node) => node.tagName === 'P' && node.className.includes('sr-only') && !node.hasAttribute('aria-live'));
// Three of them, in document order: the discarded-save notice, the settled summary, and the
// line about storage the browser refuses. Each is named so a fourth cannot shift the meaning.
const summaryRegion = () => spokenRegions()[1];
const storageRegion = () => spokenRegions()[2];

// The notice is the only region that states its own urgency.
const noticeRegion = () => screen.getAllByRole('status').find((node) => node.hasAttribute('aria-live'));

// The switch, the delete and the notice under them sit in a closed section, which a reader opens
// before using them. Hidden content is not in the accessibility tree, so a role query needs it open.
const openSaving = () => fireEvent.click(screen.getByRole('button', { name: /^この端末への保存/ }));

const textTags = (markup: string) => markup.match(/<text[^>]*>/g) ?? [];
const characterTags = (markup: string) => textTags(markup).filter((tag) => tag.includes('textLength='));

// The language belongs to the site rather than to this tool, so it outlives each store reset
// below and is put back here for every test in the file.
beforeEach(() => useLanguageStore.setState({ language: 'ja' }));

describe('the printed characters of a tag', () => {
  it.each([...TRAP_TAG_CHAR_SIZES_MM])('draws every character %d mm wide, half width or not', (charSizeMm) => {
    const values = ['東京都知事', '第12345号', 'AB-7'];
    const markup = sheetMarkup(values, charSizeMm, 1);
    const characters = characterTags(markup);
    expect(characters).toHaveLength(values.reduce((total, value) => total + countCharacters(value), 0));
    for (const tag of characters) {
      expect(tag).toContain(`textLength="${charSizeMm}"`);
      expect(tag).toContain('lengthAdjust="spacingAndGlyphs"');
      expect(tag).toContain(`font-size="${charSizeMm}"`);
    }
  });

  it('stretches the digits of every copy on the sheet', () => {
    const markup = sheetMarkup(['令和7年度'], 10, 4);
    expect(characterTags(markup)).toHaveLength(5 * 4);
    // Only the notice under the reference line keeps its natural width.
    expect(textTags(markup)).toHaveLength(5 * 4 + 1);
  });
});

describe('saving the input on this device', () => {
  beforeEach(() => {
    useTrapTagStore.setState(useTrapTagStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('says, while closed, whether the input is kept, and stays open over a failure', async () => {
    render(<TrapTagClient />);
    await screen.findByLabelText('住所');
    const section = () => screen.getByRole('button', { name: /^この端末への保存/ });
    expect(section()).toHaveAttribute('aria-expanded', 'false');
    expect(section()).toHaveTextContent('オフ：住所と氏名を含むため、既定では保存しません。');
    openSaving();
    fireEvent.click(screen.getByLabelText('この端末に保存する'));
    expect(section()).toHaveTextContent('オン：入力内容をこのブラウザーに保存しています。');
    // A failure names the address and the name, so it cannot be closed away before it is read.
    vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    fireEvent.click(screen.getByLabelText('この端末に保存する'));
    expect(section()).toHaveAttribute('aria-disabled', 'true');
    expect(section()).toHaveAttribute('aria-expanded', 'true');
  });

  it('confirms the save once the input reached storage', async () => {
    render(<TrapTagClient />);
    const toggle = await screen.findByLabelText('この端末に保存する');
    openSaving();
    const before = noticeRegion();
    // Empty as soon as the card is there, so the first message is announced too.
    expect(before?.textContent).toBe('');
    fireEvent.click(toggle);
    expect(noticeRegion()).toHaveTextContent('この端末に保存しました。');
    expect(noticeRegion()).toHaveAttribute('aria-live', 'polite');
    // The same element: a replaced one would not be announced.
    expect(noticeRegion()).toBe(before);
  });

  it('does not claim a save that the browser rejected', async () => {
    render(<TrapTagClient />);
    const toggle = await screen.findByLabelText('この端末に保存する');
    openSaving();
    vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    fireEvent.click(toggle);
    expect(noticeRegion()).toHaveTextContent('保存できませんでした');
    expect(noticeRegion()).toHaveAttribute('aria-live', 'assertive');
    expect(screen.queryByText('この端末に保存しました。')).toBeNull();
  });

  it('warns that switching the save off may have left the address behind', async () => {
    render(<TrapTagClient />);
    const toggle = await screen.findByLabelText('この端末に保存する');
    openSaving();
    fireEvent.click(toggle);
    vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    fireEvent.click(toggle);
    expect(noticeRegion()).toHaveTextContent('削除できなかった可能性があります');
    expect(noticeRegion()).toHaveAttribute('aria-live', 'assertive');
    expect(screen.queryByText('保存した内容を削除しました。')).toBeNull();
  });

  it('asks before the delete clears what is in the form', async () => {
    render(<TrapTagClient />);
    fireEvent.change(await screen.findByLabelText('住所'), { target: { value: ADDRESS } });
    openSaving();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: '保存した内容を削除' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('住所')).toHaveValue(ADDRESS);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: '保存した内容を削除' }));
    expect(screen.getByLabelText('住所')).toHaveValue('');
  });

  it('deletes an empty form without asking', async () => {
    render(<TrapTagClient />);
    await screen.findByLabelText('住所');
    openSaving();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: '保存した内容を削除' }));
    // Against a delete that ran, not against a button that does nothing: silence on its own would
    // be satisfied by a handler that had stopped working altogether.
    expect(noticeRegion()).toHaveTextContent('保存した内容と入力を削除しました。');
    expect(confirm).not.toHaveBeenCalled();
  });

  it('confirms the delete even when the write that precedes it fails', async () => {
    render(<TrapTagClient />);
    fireEvent.change(await screen.findByLabelText('住所'), { target: { value: ADDRESS } });
    openSaving();
    fireEvent.click(screen.getByLabelText('この端末に保存する'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    // Clearing the form is written before the session is removed, and that write
    // can fail on its own without the removal failing.
    vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    fireEvent.click(screen.getByRole('button', { name: '保存した内容を削除' }));
    expect(window.localStorage.getItem(TRAP_TAG_STORAGE_KEY)).toBeNull();
    expect(noticeRegion()).toHaveTextContent('保存した内容と入力を削除しました。');
    expect(noticeRegion()).toHaveAttribute('aria-live', 'polite');
  });

  it('warns when the stored session could not be removed', async () => {
    render(<TrapTagClient />);
    fireEvent.click(await screen.findByLabelText('この端末に保存する'));
    openSaving();
    vi.spyOn(window.Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError');
    });
    fireEvent.click(screen.getByRole('button', { name: '保存した内容を削除' }));
    expect(noticeRegion()).toHaveTextContent('削除できなかった可能性があります');
    expect(noticeRegion()).toHaveAttribute('aria-live', 'assertive');
    expect(screen.queryByText('保存した内容と入力を削除しました。')).toBeNull();
  });
});

describe('a second tab of the same browser', () => {
  beforeEach(() => {
    useTrapTagStore.setState(useTrapTagStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });

  it('stops writing the input back after another tab switched saving off', async () => {
    render(<TrapTagClient />);
    fireEvent.change(await screen.findByLabelText('住所'), { target: { value: ADDRESS } });
    const toggle = screen.getByLabelText('この端末に保存する');
    fireEvent.click(toggle);
    expect(window.localStorage.getItem(TRAP_TAG_STORAGE_KEY)).toContain(ADDRESS);

    const withoutInput = JSON.stringify({
      state: { language: 'ja', purpose: 'hunting', charSizeMm: 10, copies: 1, remember: false },
      version: 0,
    });
    window.localStorage.setItem(TRAP_TAG_STORAGE_KEY, withoutInput);
    fireEvent(window, new StorageEvent('storage', { key: TRAP_TAG_STORAGE_KEY, newValue: withoutInput }));

    await waitFor(() => expect(toggle).not.toBeChecked());
    fireEvent.change(screen.getByLabelText('住所'), { target: { value: `${ADDRESS}4` } });
    expect(window.localStorage.getItem(TRAP_TAG_STORAGE_KEY)).not.toContain(ADDRESS);
  });

  it('stops saving after another tab deleted the stored session', async () => {
    render(<TrapTagClient />);
    fireEvent.change(await screen.findByLabelText('住所'), { target: { value: ADDRESS } });
    const toggle = screen.getByLabelText('この端末に保存する');
    fireEvent.click(toggle);

    window.localStorage.removeItem(TRAP_TAG_STORAGE_KEY);
    fireEvent(window, new StorageEvent('storage', { key: TRAP_TAG_STORAGE_KEY, newValue: null }));

    await waitFor(() => expect(toggle).not.toBeChecked());
    // Following the switch must not put the key another tab deleted back.
    expect(window.localStorage.getItem(TRAP_TAG_STORAGE_KEY)).toBeNull();
    // The input stays in the form, but it is no longer written to this device.
    expect(screen.getByLabelText('住所')).toHaveValue(ADDRESS);
    fireEvent.change(screen.getByLabelText('住所'), { target: { value: `${ADDRESS}4` } });
    expect(window.localStorage.getItem(TRAP_TAG_STORAGE_KEY)).not.toContain(ADDRESS);
  });
});

describe('announcing the tag size', () => {
  beforeEach(() => {
    useTrapTagStore.setState(useTrapTagStore.getInitialState(), true);
    window.localStorage.clear();
    // One test in here refuses every write. The flag lives in a module-level store shared by the
    // file, so it is put back by hand rather than left to a later write happening to succeed.
    useStorageStatus.setState({ available: true, discarded: [] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('has its region on the page before the saved session is read', () => {
    const { container } = render(<TrapTagClient />);
    // Rendered with the defaults and held busy until the saved session is read. The regions have
    // to be here already, and empty, or the first message arrives with the element unheard.
    expect(container.querySelector('[aria-busy="true"]')).toContainElement(screen.getByLabelText('住所'));
    expect(spokenRegions()).toHaveLength(3);
    for (const region of spokenRegions()) expect(region.textContent).toBe('');
  });

  it('speaks the refusal to store anything, which the card line alone cannot', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    render(<TrapTagClient />);
    const address = await screen.findByLabelText('住所');
    openSaving();
    // Rehydrating does not write, so nothing has been refused yet.
    expect(storageRegion()).toBeEmptyDOMElement();
    // Typing is a write too, and the person did not ask for anything to be kept, so the card's
    // new line is the only account of it — and it arrives already written, unheard.
    fireEvent.change(address, { target: { value: ADDRESS } });
    const refusal = 'このブラウザーでは保存できません。ページを離れると入力は消えます。';
    expect(screen.getAllByText(refusal)).toHaveLength(2);
    expect(storageRegion()).toHaveTextContent(refusal);
    expect(noticeRegion()).toBeEmptyDOMElement();
    expect(summaryRegion()).not.toHaveTextContent(refusal);
    // Asking for the input to be kept fails as well. The notice says so assertively and in more
    // detail, so the standing line goes quiet rather than repeating it a moment later.
    fireEvent.click(screen.getByLabelText('この端末に保存する'));
    expect(noticeRegion()).toHaveTextContent('このブラウザーでは保存できませんでした。');
    expect(storageRegion()).toBeEmptyDOMElement();
    // Quiet because the notice covered it, not because the browser started accepting writes:
    // the card still carries the line, and only the spoken copy has gone.
    expect(screen.getAllByText(refusal)).toHaveLength(1);
    // Changing the purpose clears the notice. The browser is still refusing, but the reader has
    // already been told, so nothing speaks up again about it out of the blue.
    fireEvent.click(screen.getByRole('radio', { name: /許可捕獲/ }));
    expect(noticeRegion()).toBeEmptyDOMElement();
    expect(storageRegion()).toBeEmptyDOMElement();
    expect(screen.getAllByText(refusal)).toHaveLength(1);
  });

  it('speaks the notice in the language chosen after it was raised', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    render(<TrapTagClient />);
    await screen.findByLabelText('住所');
    openSaving();
    fireEvent.click(screen.getByLabelText('この端末に保存する'));
    expect(noticeRegion()).toHaveTextContent('このブラウザーでは保存できませんでした。');
    // The notice is the one region with no lang of its own: it inherits the wrapper's. Holding the
    // text it was given would leave Japanese under lang="en" the moment the language changes.
    act(() => useLanguageStore.getState().setLanguage('en'));
    expect(noticeRegion()).toHaveTextContent('This browser could not save the input');
  });

  it('is read in the language of the interface', async () => {
    render(<TrapTagClient />);
    await screen.findByLabelText('住所');
    // Outside every element that carries lang, so each states its own. Counted first, or a loop
    // over nothing would pass while no region is on the page at all.
    expect(spokenRegions()).toHaveLength(3);
    for (const region of spokenRegions()) expect(region).toHaveAttribute('lang', 'ja');
    act(() => useLanguageStore.getState().setLanguage('en'));
    for (const region of spokenRegions()) expect(region).toHaveAttribute('lang', 'en');
  });

  it('gives the tag size and the wrap width under the preview', async () => {
    render(<TrapTagClient />);
    fireEvent.change(await screen.findByLabelText('住所'), { target: { value: '東京都' } });
    const caption = screen.getByRole('img', { name: '印刷する標識のプレビュー' }).closest('figure');
    expect(caption).toHaveTextContent('標識 1 枚 38 × 22 mm、1 行 18 字で折り返し。');
  });

  it('waits for the typing to settle instead of reading out every keystroke', async () => {
    render(<TrapTagClient />);
    const address = await screen.findByLabelText('住所');
    fireEvent.change(address, { target: { value: '東京都' } });
    // Let the first announcement land on real timers. Switching while one is
    // pending leaves it scheduled on a clock the test no longer drives, and the
    // fake clearTimeout cannot cancel it either.
    await screen.findByText('標識 1 枚は 38 × 22 mm。A4 に 1 枚並びます。', {}, { timeout: 2000 });

    vi.useFakeTimers();
    fireEvent.change(address, { target: { value: '東京都千' } });
    fireEvent.change(address, { target: { value: '東京都千代' } });
    // The region still holds the previous sentence: neither keystroke was read out.
    expect(screen.getByText('標識 1 枚は 38 × 22 mm。A4 に 1 枚並びます。')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(700));
    expect(screen.getByText('標識 1 枚は 58 × 22 mm。A4 に 1 枚並びます。')).toBeInTheDocument();
  });
});

describe('input of another tab', () => {
  beforeEach(() => {
    useTrapTagStore.setState(useTrapTagStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });

  it('never replaces the form of this tab, not even while saving is on', async () => {
    render(<TrapTagClient />);
    fireEvent.change(await screen.findByLabelText('住所'), { target: { value: ADDRESS } });
    const toggle = screen.getByLabelText('この端末に保存する');
    fireEvent.click(toggle);

    // Another tab writes a whole session of its own, with saving still on.
    const otherTab = JSON.stringify({
      state: {
        language: 'ja',
        purpose: 'permit',
        charSizeMm: 15,
        copies: 6,
        remember: true,
        fields: { ...emptyTrapTagDraft, address: '大阪府大阪市北区1-1-1', name: '田中花子' },
      },
      version: 0,
    });
    window.localStorage.setItem(TRAP_TAG_STORAGE_KEY, otherTab);
    fireEvent(window, new StorageEvent('storage', { key: TRAP_TAG_STORAGE_KEY, newValue: otherTab }));

    await waitFor(() => expect(screen.getByLabelText('住所')).toHaveValue(ADDRESS));
    expect(screen.queryByDisplayValue('田中花子')).toBeNull();
    expect(toggle).toBeChecked();
    expect(screen.getByLabelText('一字の大きさ')).toHaveValue('10');
    expect(screen.getByLabelText('A4 1 枚に並べる数')).toHaveValue('1');
    // The purpose belongs to this tab too: the permit items never appear.
    expect(screen.queryByLabelText('許可の有効期間')).toBeNull();
  });
});

describe('a saved session that could not be read', () => {
  beforeEach(() => {
    useTrapTagStore.setState(useTrapTagStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });

  const line = discardedSaveMessage('ja');

  it('speaks for its own saved data and stays quiet about another tool', async () => {
    reportDiscardedSave('nilay-labs-hunting-hours-v1');
    render(<TrapTagClient />);
    await screen.findByLabelText('住所');
    expect(screen.queryAllByText(line)).toHaveLength(0);
    act(() => reportDiscardedSave(TRAP_TAG_STORAGE_KEY));
    // The card shows it, and the live region that mounted empty announces it.
    expect(screen.getAllByText(line)).toHaveLength(2);
  });
});

describe('a layout that does not fit on the sheet', () => {
  beforeEach(() => {
    useTrapTagStore.setState(useTrapTagStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
    useLanguageStore.setState({ language: 'ja' });
  });

  it('says what to change in place of a preview whose tags would overlap', async () => {
    render(<TrapTagClient />);
    fireEvent.change(await screen.findByLabelText('住所'), { target: { value: ADDRESS } });
    fireEvent.change(screen.getByLabelText('氏名'), { target: { value: '山田太郎' } });
    expect(screen.getByRole('img', { name: '印刷する標識のプレビュー' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('一字の大きさ'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('A4 1 枚に並べる数'), { target: { value: '6' } });
    expect(screen.getByRole('alert')).toHaveTextContent('A4 に収まりません。');
    expect(screen.queryByRole('img', { name: '印刷する標識のプレビュー' })).toBeNull();
    // Back within the sheet, the preview returns and the warning goes.
    fireEvent.change(screen.getByLabelText('A4 1 枚に並べる数'), { target: { value: '1' } });
    expect(screen.getByRole('img', { name: '印刷する標識のプレビュー' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
