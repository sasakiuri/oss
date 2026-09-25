import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { storageKey, useLawQuizStore } from '@/app/(standalone)/labs/law-quiz/_store';
import { LawQuizClient } from '@/app/(standalone)/labs/law-quiz/law-quiz-client';
import { lawQuestions, lawQuestionsById, LAW_TEXT_CHECKED_ON } from '@/app/(standalone)/labs/law-quiz/questions';
import { discardedSaveMessage } from '@/components/labs';
import { reportDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { useLanguageStore } from '@/store';

// Only the shared chrome is stubbed: it needs the Next.js app router, which a unit render has
// not mounted. The notice and its wording stay real.
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

// Two sr-only paragraphs: the discarded-save notice first and the verdict last, kept apart
// because a status region is atomic and sharing one would repeat the notice on every answer.
const spokenRegions = () =>
  screen.getAllByRole('status').filter((node) => node.tagName === 'P' && node.className.includes('sr-only'));

const question = (id: string) => {
  const found = lawQuestionsById.get(id);
  if (!found) throw new Error(`no question ${id}`);
  return found;
};

/** Put a known session on screen, rather than depending on which questions a shuffle drew. */
const openSession = (ids: string[]) =>
  act(() =>
    useLawQuizStore.setState({
      session: {
        scope: 'all',
        prompts: ids.map((id) => ({ id, choices: question(id).choices })),
        answers: [],
        revealed: false,
      },
    }),
  );

/** Wait until the saved state has been read and the screen is no longer held busy. */
const loaded = async () => {
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
  return screen.getByRole('button', { name: 'テストを開始' });
};

describe('the law quiz screen', () => {
  beforeEach(() => {
    // persist writes on every set, so the reset comes first and the clear leaves storage empty.
    useLawQuizStore.setState(useLawQuizStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
    // The language is the site's now, so it outlives this store's reset.
    useLanguageStore.setState({ language: 'ja' });
    // Each new screen of a run is brought to the top of the viewport, which jsdom does not implement.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('has both spoken regions on the page before there is anything to say', () => {
    const { container } = render(<LawQuizClient />);
    // Rendered with the defaults, and held busy until the saved state is read.
    expect(container.querySelector('[aria-busy="true"]')).toContainElement(
      screen.getByRole('button', { name: 'テストを開始' }),
    );
    const regions = spokenRegions();
    expect(regions).toHaveLength(2);
    for (const region of regions) {
      expect(region).toBeEmptyDOMElement();
      expect(region).toHaveAttribute('lang', 'ja');
    }
  });

  it('opens on the settings, and says when the law was read', async () => {
    render(<LawQuizClient />);
    expect(await loaded()).toBeInTheDocument();
    expect(screen.getByLabelText('分野')).toHaveValue('all');
    expect(screen.getAllByText(new RegExp(LAW_TEXT_CHECKED_ON)).length).toBeGreaterThan(0);
    expect(screen.getByText('鳥獣の保護及び管理並びに狩猟の適正化に関する法律')).toBeInTheDocument();
  });

  it('counts the questions in each area on the settings, from the data itself', async () => {
    render(<LawQuizClient />);
    await loaded();
    const scope = screen.getByLabelText('分野');
    expect(within(scope).getByRole('option', { name: `すべて（${lawQuestions.length} 問）` })).toBeInTheDocument();
  });

  it('marks an answer, shows the article behind it, and only then moves on', async () => {
    const user = userEvent.setup();
    render(<LawQuizClient />);
    await loaded();
    openSession(['safety-01', 'duties-07']);

    const first = question('safety-01');
    expect(await screen.findByText(first.question)).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: first.answer }));

    expect(screen.getByText('正解')).toBeInTheDocument();
    expect(screen.getByText(first.explanation)).toBeInTheDocument();
    // The article is the point of the tool: it is named on screen and links to the law itself.
    const source = screen.getByText(
      (_, element) => element?.tagName === 'P' && (element.textContent ?? '').startsWith('根拠:'),
    );
    expect(source).toHaveTextContent('第 38 条第 1 項');
    expect(
      within(source).getByRole('link', { name: '鳥獣の保護及び管理並びに狩猟の適正化に関する法律' }),
    ).toHaveAttribute('href', 'https://laws.e-gov.go.jp/law/414AC0000000088');
    // The verdict is spoken from a timer, so that the region changes after the page has settled.
    await waitFor(() => expect(spokenRegions()[1]).toHaveTextContent(`正解。正しい答えは「${first.answer}」です。`));

    // The pressed choice is gone, so the keyboard is handed to the way on rather than the page top.
    await waitFor(() => expect(screen.getByRole('button', { name: '次の問題へ' })).toHaveFocus());

    await user.click(screen.getByRole('button', { name: '次の問題へ' }));
    expect(screen.getByText(question('duties-07').question)).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('tells a wrong answer from a skipped question and keeps both for review', async () => {
    const user = userEvent.setup();
    render(<LawQuizClient />);
    await loaded();
    openSession(['methods-01', 'areas-02']);

    const wrong = question('methods-01').choices.find((choice) => choice !== question('methods-01').answer) ?? '';
    await user.click(screen.getByRole('button', { name: wrong }));
    expect(screen.getByText('不正解')).toBeInTheDocument();
    expect(screen.getByText(wrong, { selector: 'span' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '次の問題へ' }));

    await user.click(screen.getByRole('button', { name: 'わからない（未回答で次へ）' }));
    expect(screen.getByText('未回答')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: '結果を見る' })).toHaveFocus());
    await user.click(screen.getByRole('button', { name: '結果を見る' }));

    expect(screen.getByRole('heading', { name: 'テスト結果' })).toHaveFocus();
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('間違えた問題')).toBeInTheDocument();
    await waitFor(() =>
      expect(spokenRegions()[1]).toHaveTextContent('テスト終了。2 問中 0 問正解、誤答 1 問、未回答 1 問です。'),
    );
    expect(useLawQuizStore.getState().reviewIds).toEqual(['methods-01', 'areas-02']);
    expect(screen.getByRole('button', { name: '間違えた 2 問をもう一度' })).toBeInTheDocument();
  });

  it('offers the marked questions again from the settings', async () => {
    render(<LawQuizClient />);
    await loaded();
    act(() => useLawQuizStore.setState({ reviewIds: ['licence-03'] }));
    expect(screen.getByRole('button', { name: '要復習の 1 問だけ解く' })).toBeInTheDocument();
    expect(screen.getByText(/正答しても消えません。/)).toBeInTheDocument();
  });

  it('tells the reader when a save could not be read, in its own region', async () => {
    render(<LawQuizClient />);
    await loaded();
    act(() => reportDiscardedSave(storageKey));
    expect(spokenRegions()[0]).toHaveTextContent(discardedSaveMessage('ja'));
  });

  it('says when the browser cannot save at all', async () => {
    useStorageStatus.setState({ available: false, discarded: [] });
    render(<LawQuizClient />);
    expect(await screen.findByText(/このブラウザーでは保存できません。/)).toBeInTheDocument();
  });

  it('switches the interface to English while the questions stay in Japanese', async () => {
    render(<LawQuizClient />);
    await loaded();
    act(() => useLanguageStore.getState().setLanguage('en'));
    expect(screen.getByRole('button', { name: 'Start quiz' })).toBeInTheDocument();
    expect(screen.getByText(/choices and explanations are in Japanese/)).toBeInTheDocument();
    openSession(['basics-01']);
    expect(screen.getByText(question('basics-01').question)).toHaveAttribute('lang', 'ja');
  });
  it('always offers a way out of a running quiz and asks before dropping answers', async () => {
    const user = userEvent.setup();
    const confirmed = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<LawQuizClient />);
    await loaded();
    openSession(['basics-01', 'basics-02']);

    // Nothing answered yet, so there is nothing to lose and nothing to ask about.
    await user.click(screen.getByRole('button', { name: 'やめる' }));
    expect(confirmed).not.toHaveBeenCalled();
    expect(useLawQuizStore.getState().session).toBeNull();

    openSession(['basics-01', 'basics-02']);
    const [firstChoice] = within(screen.getByRole('group', { name: '選択肢' })).getAllByRole('button');
    if (!firstChoice) throw new Error('Expected a choice button.');
    await user.click(firstChoice);
    await user.click(screen.getByRole('button', { name: '次の問題へ' }));

    // Now there is an answer to lose: refusing keeps the reader where they were.
    await user.click(screen.getByRole('button', { name: 'やめる' }));
    expect(confirmed).toHaveBeenCalledTimes(1);
    expect(useLawQuizStore.getState().session).not.toBeNull();

    confirmed.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'やめる' }));
    expect(useLawQuizStore.getState().session).toBeNull();
    expect(await screen.findByRole('button', { name: 'テストを開始' })).toBeInTheDocument();
    confirmed.mockRestore();
  });

  it('sets the number of questions in one tap', async () => {
    const user = userEvent.setup();
    render(<LawQuizClient />);
    await loaded();
    // The last choice says how many "all" is for the scope in force.
    expect(screen.getByRole('radio', { name: `全 ${lawQuestions.length} 問` })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '5 問' }));
    expect(useLawQuizStore.getState().options.questionCount).toBe(5);
    await user.click(screen.getByRole('button', { name: 'テストを開始' }));
    expect(screen.getByText('1 / 5')).toBeInTheDocument();
  });

  it('keeps the sources closed below the quiz, saying what they hold', async () => {
    const user = userEvent.setup();
    render(<LawQuizClient />);
    await loaded();
    const toggle = screen.getByRole('button', { name: /^出典/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent(LAW_TEXT_CHECKED_ON);
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/都道府県が定めます/)).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: '鳥獣の保護及び管理並びに狩猟の適正化に関する法律' }).length,
    ).toBeGreaterThan(0);
  });

  it('puts retrying the missed questions straight under the score', async () => {
    const user = userEvent.setup();
    render(<LawQuizClient />);
    await loaded();
    openSession(['basics-01']);
    await user.click(screen.getByRole('button', { name: 'わからない（未回答で次へ）' }));
    await user.click(screen.getByRole('button', { name: '結果を見る' }));
    const retry = screen.getByRole('button', { name: '間違えた 1 問をもう一度' });
    // Ahead of the list of what was missed, so it is in reach without scrolling past the list.
    expect(
      retry.compareDocumentPosition(screen.getByRole('heading', { name: '間違えた問題' })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await user.click(retry);
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
  });

  it('says a reloaded run picks up where it left off, until the reader moves on', async () => {
    const user = userEvent.setup();
    openSession(['basics-01', 'basics-02', 'basics-03']);
    act(() => {
      useLawQuizStore.getState().answer(null);
      useLawQuizStore.getState().advance();
    });
    const saved = window.localStorage.getItem(storageKey) as string;
    useLawQuizStore.setState(useLawQuizStore.getInitialState(), true);
    window.localStorage.setItem(storageKey, saved);
    render(<LawQuizClient />);
    expect(await screen.findByText('前回の続きから再開しています。')).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'わからない（未回答で次へ）' }));
    await user.click(screen.getByRole('button', { name: '次の問題へ' }));
    expect(screen.queryByText('前回の続きから再開しています。')).toBeNull();
  });
});
