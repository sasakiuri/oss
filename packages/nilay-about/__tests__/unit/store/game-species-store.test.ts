import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { speciesStorageKey, useGameSpeciesStore } from '@/app/(standalone)/labs/game-species-test/_store';
import { GameSpeciesTestClient } from '@/app/(standalone)/labs/game-species-test/game-species-test-client';
import { discardedSaveMessage } from '@/components/labs';
import { quizList } from '@/features/game-species/quiz-data';
import { reportDiscardedSave, useStorageStatus } from '@/lib/browser-storage';

const store = () => useGameSpeciesStore.getState();
/** Wait until the saved record has been read and the screen is no longer held busy. */
const loaded = () => waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
// The key is spelled out once, so renaming speciesStorageKey fails loudly here rather than
// orphaning every reader's saved record in silence. Everything else goes through the constant.
const savedKey = 'nilay-labs-species-v1';
const discardedNotice = discardedSaveMessage('ja', 'record');
const visibleCopies = (text: string) =>
  screen.getAllByText(text).filter((element) => !element.className.includes('sr-only'));
// The page-level announcer is rendered before the tool itself, so it comes first in document order.
// Two sr-only regions sit above the cards: the discarded-save notice first and the storage warning
// last, kept apart because a status region is atomic and would repeat the notice on every change.
const announcers = () => screen.getAllByRole('status').filter((element) => element.className.includes('sr-only'));
const announcer = () => announcers()[0];
const storageAnnouncer = () => announcers()[1];
beforeEach(() => {
  vi.restoreAllMocks();
  // persist writes on every set, so the reset comes first and the clear leaves storage truly empty.
  useGameSpeciesStore.setState(useGameSpeciesStore.getInitialState(), true);
  window.localStorage.clear();
  useStorageStatus.setState({ available: true, discarded: [] });
});

describe('species learning', () => {
  it('saves the record under the key the store publishes', () => {
    expect(speciesStorageKey).toBe(savedKey);
    store().start('all');
    expect(window.localStorage.getItem(savedKey)).not.toBeNull();
  });
  it('presents each photo once, records self assessment, and reviews only missed species', () => {
    store().start('all');
    expect(new Set(store().order).size).toBe(quizList.length);
    const missed = store().order[0];
    if (!missed) throw new Error('Expected at least one item in the order.');
    store().reveal();
    store().rate(false);
    store().reveal();
    store().rate(true);
    store().start('review');
    expect(store().order).toEqual([missed]);
    store().reveal();
    store().rate(true);
    expect(store().currentIndex).toBe(1);
    expect(store().results[missed]).toBe(true);
  });
  it('requires revealing the answer before self assessment and leaves skipped items ungraded', () => {
    store().start('all');
    store().rate(true);
    expect(store().currentIndex).toBe(0);
    store().next();
    expect(store().sessionAnswers).toEqual({});
    store().previous();
    expect(store().currentIndex).toBe(0);
    expect(store().showingAnswer).toBe(false);
  });
  it('finishes a session without looping or continuing autoplay', () => {
    store().start('all');
    store().setAutoPlay(true);
    for (let i = 0; i < quizList.length; i++) store().next();
    expect(store().currentIndex).toBe(quizList.length);
    expect(store().autoPlay).toBe(false);
    store().next();
    expect(store().currentIndex).toBe(quizList.length);
  });
  it('restores order, progress and ratings but starts paused with the answer hidden', async () => {
    store().start('all');
    const order = store().order;
    const [firstOrderImage] = order;
    if (!firstOrderImage) throw new Error('Expected at least one item in the order.');
    store().reveal();
    store().rate(false);
    store().reveal();
    store().setAutoPlay(true);
    store().setInterval(5);
    const saved = window.localStorage.getItem(savedKey)!;
    useGameSpeciesStore.setState(useGameSpeciesStore.getInitialState(), true);
    window.localStorage.setItem(savedKey, saved);
    await useGameSpeciesStore.persist.rehydrate();
    expect(store()).toMatchObject({
      order,
      currentIndex: 1,
      interval: 5,
      autoPlay: false,
      showingAnswer: false,
      results: { [firstOrderImage]: false },
    });
  });
  it('rejects invalid order indices and unrecognized photos', async () => {
    const [firstQuiz] = quizList;
    if (!firstQuiz) throw new Error('Expected at least one quiz entry.');
    for (const state of [
      { ...store(), order: [firstQuiz.image], currentIndex: 2 },
      { ...store(), order: ['/unknown.jpg'] },
    ]) {
      window.localStorage.setItem(savedKey, JSON.stringify({ state, version: 0 }));
      await useGameSpeciesStore.persist.rehydrate();
      expect(store().order).toEqual([]);
      expect(useStorageStatus.getState().discarded).toEqual([speciesStorageKey]);
    }
  });
  it('tells the reader when unreadable saved data was dropped instead of starting over quietly', async () => {
    window.localStorage.setItem(
      savedKey,
      JSON.stringify({ state: { ...store(), order: ['/unknown.jpg'] }, version: 0 }),
    );
    render(createElement(GameSpeciesTestClient));
    await loaded();
    expect(useStorageStatus.getState().discarded).toEqual([speciesStorageKey]);
    expect(announcer()).toHaveTextContent(discardedNotice);
    expect(visibleCopies(discardedNotice)).toHaveLength(1);
    expect(visibleCopies(discardedNotice)[0]).not.toHaveAttribute('role');
    // The notice belongs to neither mode, so switching to the quiz must not hide it.
    fireEvent.click(screen.getByRole('radio', { name: '判別テスト（4 択・制限時間つき）' }));
    expect(visibleCopies(discardedNotice)).toHaveLength(1);
  });
  it('announces a discarded save in a status region that was already on the page', async () => {
    const { container } = render(createElement(GameSpeciesTestClient));
    // A status region inserted together with its text is not announced, so this one is on the page
    // from the first paint, before the record has been read, and the same node stays through loading.
    // The slideshow is rendered from the start and held busy until then.
    expect(container.querySelector('[aria-busy="true"]')).toContainElement(
      screen.getByRole('button', { name: '答えを見る' }),
    );
    const region = announcer();
    expect(region).toBeEmptyDOMElement();
    expect(region).toHaveAttribute('lang', 'ja');
    await loaded();
    expect(announcer()).toBe(region);
    expect(region).toBeEmptyDOMElement();
    act(() => reportDiscardedSave(speciesStorageKey));
    expect(announcer()).toBe(region);
    expect(region).toHaveTextContent(discardedNotice);
    expect(visibleCopies(discardedNotice)).toHaveLength(1);
  });
  it('does not announce the counter that loading fills in, only the moves after it', async () => {
    const { container } = render(createElement(GameSpeciesTestClient));
    // Empty in the server HTML and filled once the record is read: live then, it would be read out on every visit.
    expect(container.querySelector('[aria-live]')).toBeNull();
    await loaded();
    expect(screen.getByText('1 / 45')).toHaveAttribute('aria-live', 'polite');
  });
  it('keeps the warning about unusable storage in sight in both modes', async () => {
    // A successful write clears the flag again, so the browser has to keep refusing for real.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    const warning = 'このブラウザーでは記録を保存できません。';
    render(createElement(GameSpeciesTestClient));
    await loaded();
    expect(visibleCopies(warning)).toHaveLength(1);
    expect(storageAnnouncer()).toHaveTextContent(warning);
    fireEvent.click(screen.getByRole('radio', { name: '判別テスト（4 択・制限時間つき）' }));
    expect(visibleCopies(warning)).toHaveLength(1);
  });
  it('stays quiet about another tool losing its saved data', async () => {
    // Labs tools share the module while the browser stays on the same page, so the notice is per key.
    reportDiscardedSave('nilay-labs-hunting-hours-v1');
    render(createElement(GameSpeciesTestClient));
    await loaded();
    expect(useStorageStatus.getState().discarded).toEqual(['nilay-labs-hunting-hours-v1']);
    expect(screen.queryByText(/読み取れなかったため/)).toBeNull();
  });
  it('treats a first visit as a normal start, not a discarded save', async () => {
    // persist calls merge with nothing stored on a first visit, which must not look like lost data.
    window.localStorage.clear();
    expect(window.localStorage.getItem(speciesStorageKey)).toBeNull();
    await useGameSpeciesStore.persist.rehydrate();
    expect(useStorageStatus.getState().discarded).toEqual([]);
    window.localStorage.clear();
    expect(window.localStorage.getItem(speciesStorageKey)).toBeNull();
    render(createElement(GameSpeciesTestClient));
    await loaded();
    expect(useStorageStatus.getState().discarded).toEqual([]);
    expect(screen.queryByText(/読み取れなかったため/)).toBeNull();
  });
  it('keeps quiet when the saved data still parses', async () => {
    store().start('all');
    await useGameSpeciesStore.persist.rehydrate();
    render(createElement(GameSpeciesTestClient));
    await loaded();
    expect(useStorageStatus.getState().discarded).toEqual([]);
    expect(screen.queryByText(/読み取れなかったため/)).toBeNull();
  });
  it('draws the requested count from the chosen category without duplicates', () => {
    store().start('all', { category: 'birds', questionCount: 5 });
    expect(store().order).toHaveLength(5);
    expect(new Set(store().order).size).toBe(5);
    expect(store().order.every((id) => quizList.find((q) => q.image === id)?.category === 'birds')).toBe(true);
    store().start('all', { category: 'mammals', questionCount: 20 });
    expect(store().order).toHaveLength(19);
    expect(store().order.every((id) => quizList.find((q) => q.image === id)?.category === 'mammals')).toBe(true);
  });
  it('limits review to the chosen category and retains all-time ratings', () => {
    const bird = quizList.find((q) => q.category === 'birds')!;
    const mammal = quizList.find((q) => q.category === 'mammals')!;
    useGameSpeciesStore.setState({ results: { [bird.image]: false, [mammal.image]: false } });
    store().start('review', { category: 'birds', questionCount: 5 });
    expect(store().order).toEqual([bird.image]);
    expect(store().results[mammal.image]).toBe(false);
  });
  it('reviews selected ungraded items without inventing a rating', () => {
    store().start('all');
    const selected = store().order.slice(0, 3);
    const [firstSelected] = selected;
    if (!firstSelected) throw new Error('Expected at least one selected item.');
    store().startSelected([...selected, firstSelected, '/unknown.jpg']);
    expect(new Set(store().order)).toEqual(new Set(selected));
    expect(store().sessionAnswers).toEqual({});
    expect(store().results).toEqual({});
    const order = store().order;
    store().startSelected([]);
    expect(store().order).toEqual(order);
  });
  it('reads a save written before the language belonged to the site', async () => {
    // The tools each kept their own copy of it. Such a save is still a good save: the key it no
    // longer names is passed over rather than making the whole of it unreadable.
    store().start('all');
    store().next();
    const saved = JSON.parse(window.localStorage.getItem(savedKey)!) as { state: Record<string, unknown> };
    // Resetting the store writes over storage, so the fixture goes in after it.
    useGameSpeciesStore.setState(useGameSpeciesStore.getInitialState(), true);
    window.localStorage.setItem(savedKey, JSON.stringify({ state: { ...saved.state, language: 'en' }, version: 0 }));
    await useGameSpeciesStore.persist.rehydrate();
    expect(store().currentIndex).toBe(1);
    expect(useStorageStatus.getState().discarded).not.toContain(savedKey);
  });
  it('keeps old progress when saved data predates category options', async () => {
    store().start('all');
    store().next();
    const { category: _category, questionCount: _questionCount, ...old } = store();
    window.localStorage.setItem(savedKey, JSON.stringify({ state: old, version: 0 }));
    await useGameSpeciesStore.persist.rehydrate();
    expect(store()).toMatchObject({ order: old.order, currentIndex: 1, category: 'all', questionCount: null });
  });
});

describe('the slideshow screen', () => {
  // Each new screen of a session is brought to the top of the viewport, which jsdom does not implement.
  beforeEach(() => void (Element.prototype.scrollIntoView = vi.fn()));

  // Put a saved record in storage and bring the store back to a fresh page, as a reload would.
  const reloadWith = (prepare: () => void) => {
    prepare();
    const saved = window.localStorage.getItem(savedKey) as string;
    useGameSpeciesStore.setState(useGameSpeciesStore.getInitialState(), true);
    window.localStorage.setItem(savedKey, saved);
  };

  it('says a reloaded slideshow picks up where it left off, until the reader moves on', async () => {
    reloadWith(() => {
      store().start('all');
      store().next();
    });
    render(createElement(GameSpeciesTestClient));
    expect(await screen.findByText('前回の続きから再開しています。')).toBeInTheDocument();
    expect(screen.getByText('2 / 45')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '採点せず次へ' }));
    expect(screen.queryByText('前回の続きから再開しています。')).toBeNull();
  });

  it('keeps the settings closed under a running slideshow, with the values in force in the summary', async () => {
    render(createElement(GameSpeciesTestClient));
    await loaded();
    const toggle = screen.getByRole('button', { name: /^出題設定/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('全種類 · 45 問');
    expect(screen.queryByRole('button', { name: 'この設定で開始（45 問）' })).toBeNull();
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('radio', { name: /^獣類/ }));
    // Nineteen mammals: the largest count asks every one of them, and the choice says so.
    expect(screen.getByRole('radio', { name: '19 問' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: '20 問' })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: '5 問' }));
    expect(toggle).toHaveTextContent('獣類 · 5 問');
    fireEvent.click(screen.getByRole('button', { name: 'この設定で開始（5 問）' }));
    expect(store().order).toHaveLength(5);
  });

  it('offers the species marked to review in one tap once the session ends', async () => {
    reloadWith(() => store().start('all', { category: 'birds', questionCount: 2 }));
    render(createElement(GameSpeciesTestClient));
    await loaded();
    const first = store().order[0];
    fireEvent.click(screen.getByRole('button', { name: '答えを見る' }));
    fireEvent.click(screen.getByRole('button', { name: '要復習' }));
    fireEvent.click(screen.getByRole('button', { name: '答えを見る' }));
    fireEvent.click(screen.getByRole('button', { name: 'わかった' }));
    await screen.findByRole('heading', { name: '学習結果' });
    fireEvent.click(screen.getByRole('button', { name: '要復習の 1 問をもう一度' }));
    expect(store()).toMatchObject({ order: [first], mode: 'review', currentIndex: 0 });
  });
});
