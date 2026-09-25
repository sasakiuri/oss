import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { speciesStorageKey, useGameSpeciesStore } from '@/app/(standalone)/labs/game-species-test/_store';
import { buildExamQuestions } from '@/app/(standalone)/labs/game-species-test/exam';
import { GameSpeciesTestClient } from '@/app/(standalone)/labs/game-species-test/game-species-test-client';
import { quizList, type Quiz } from '@/features/game-species/quiz-data';

const store = () => useGameSpeciesStore.getState();
// The exam takes its randomness as an argument so questions and choices can be asserted.
const always = (value: number) => () => value;
const cycle = (values: number[]) => {
  let index = 0;
  return () => values[index++ % values.length] as number;
};
const categoryOf = (answer: string) => quizList.find((quiz) => quiz.answer === answer)?.category;

beforeEach(() => {
  // persist writes on every set, so the reset comes first and the clear leaves storage truly empty.
  useGameSpeciesStore.setState(useGameSpeciesStore.getInitialState(), true);
  window.localStorage.clear();
  vi.restoreAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
});

// The quiz screens answer for themselves what the store cannot: that no path drops answers unasked.
const openQuiz = async (timeLimit: 'none' | '5' | '10' = 'none') => {
  const view = render(createElement(GameSpeciesTestClient));
  await screen.findByRole('button', { name: '答えを見る' });
  fireEvent.click(screen.getByRole('radio', { name: '判別テスト（4 択・制限時間つき）' }));
  const limits = { none: '無制限', '5': '5 秒', '10': '10 秒' } as const;
  fireEvent.click(
    within(screen.getByRole('group', { name: '1 問の制限時間' })).getByRole('radio', { name: limits[timeLimit] }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'テストを開始（10 問）' }));
  return view;
};
const answerFirstChoice = () =>
  fireEvent.click(within(screen.getByRole('group', { name: '選択肢' })).getAllByRole('button')[0] as HTMLElement);
// The announcer is the only element that names the question number.
const liveRegion = () => screen.getByText(/問目/);

describe('species exam', () => {
  it('asks four unique choices per photo, all from the same category as the answer', () => {
    const questions = buildExamQuestions(quizList, quizList.length, cycle([0.13, 0.71, 0.4, 0.92, 0.05]));
    expect(questions).toHaveLength(quizList.length);
    expect(new Set(questions.map((question) => question.image)).size).toBe(quizList.length);
    for (const question of questions) {
      expect(question.choices).toHaveLength(4);
      expect(new Set(question.choices).size).toBe(4);
      expect(question.choices).toContain(question.answer);
      expect(question.choices.map(categoryOf)).toEqual(Array(4).fill(categoryOf(question.answer)));
    }
  });
  it('repeats exactly for the same random source and differs for another', () => {
    const draw = () => buildExamQuestions(quizList, 5, cycle([0.13, 0.71, 0.4, 0.92, 0.05]));
    expect(draw()).toEqual(draw());
    expect(draw()).not.toEqual(buildExamQuestions(quizList, 5, cycle([0.6, 0.02, 0.88, 0.31])));
  });
  it('borrows wrong choices from the other category when one category is too small', () => {
    const species: Quiz[] = [
      { image: '/a.jpg', answer: 'A', category: 'mammals' },
      { image: '/b.jpg', answer: 'B', category: 'mammals' },
      { image: '/c.jpg', answer: 'C', category: 'birds' },
      { image: '/d.jpg', answer: 'D', category: 'birds' },
    ];
    const [question] = buildExamQuestions(species.slice(0, 1), 1, always(0), species);
    expect(question?.choices.toSorted()).toEqual(['A', 'B', 'C', 'D']);
  });
  it('never asks for more questions than the pool holds', () => {
    expect(buildExamQuestions(quizList, 100, always(0))).toHaveLength(quizList.length);
    expect(buildExamQuestions(quizList, 0, always(0))).toHaveLength(0);
    expect(store().exam).toBeNull();
    store().startExam({ category: 'mammals', questionCount: 20, timeLimit: 5 }, always(0));
    expect(store().exam?.questions).toHaveLength(19);
    expect(store().exam).toMatchObject({ category: 'mammals', questionCount: 20, timeLimit: 5 });
    expect(store().exam?.questions.map((question) => categoryOf(question.answer))).toEqual(Array(19).fill('mammals'));
  });
  it('sends only missed and unanswered species to review, once the exam ends', () => {
    const known = quizList[0] as Quiz;
    useGameSpeciesStore.setState({ results: { [known.image]: true } });
    store().startExam({ category: 'all', questionCount: 3, timeLimit: 10 }, always(0));
    const questions = store().exam?.questions ?? [];
    expect(questions).toHaveLength(3);
    const [first, second, third] = questions as [(typeof questions)[0], (typeof questions)[0], (typeof questions)[0]];
    store().answerExam(first.answer);
    store().answerExam(second.choices.find((choice) => choice !== second.answer) as string);
    expect(store().results).toEqual({ [known.image]: true });
    // Timing out counts as no answer.
    store().answerExam(null);
    expect(store().results).toEqual({
      [known.image]: true,
      [second.image]: false,
      [third.image]: false,
    });
    expect(store().results[first.image]).toBeUndefined();
    store().answerExam(first.answer);
    expect(store().exam?.answers).toHaveLength(3);
  });
  it('keeps a correct answer from erasing an earlier self assessment', () => {
    store().startExam({ category: 'all', questionCount: 1, timeLimit: null }, always(0));
    const question = store().exam?.questions[0];
    useGameSpeciesStore.setState({ results: { [question?.image as string]: false } });
    store().answerExam(question?.answer as string);
    expect(store().results).toEqual({ [question?.image as string]: false });
  });
  it('discards the exam on reload but leaves ending it to the caller', async () => {
    store().start('all');
    store().startExam({ category: 'all', questionCount: 10, timeLimit: 10 }, always(0));
    const saved = window.localStorage.getItem(speciesStorageKey) as string;
    expect(JSON.parse(saved).state.exam).toBeUndefined();
    useGameSpeciesStore.setState(useGameSpeciesStore.getInitialState(), true);
    window.localStorage.setItem(speciesStorageKey, saved);
    await useGameSpeciesStore.persist.rehydrate();
    expect(store().exam).toBeNull();
    // Slideshow actions never drop a running exam behind the caller's back; only exitExam ends it.
    store().startExam({ category: 'all', questionCount: 10, timeLimit: 10 }, always(0));
    store().start('all');
    store().startSelected(store().order.slice(0, 3));
    expect(store().exam?.questions).toHaveLength(10);
    store().exitExam();
    expect(store().exam).toBeNull();
    store().answerExam('マガモ');
    expect(store().exam).toBeNull();
  });
  it('switches the card to the exam as soon as the mode changes, before the first question', async () => {
    render(createElement(GameSpeciesTestClient));
    await screen.findByRole('button', { name: '答えを見る' });
    fireEvent.click(screen.getByRole('radio', { name: '判別テスト（4 択・制限時間つき）' }));
    expect(screen.getByRole('heading', { name: '判別テストの設定' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'テストを開始（10 問）' })).toBeInTheDocument();
    for (const grading of ['答えを見る', 'わかった', '要復習', '採点せず次へ'])
      expect(screen.queryByRole('button', { name: grading })).toBeNull();
    // The slideshow shortcuts neither work nor are advertised while the exam card is on screen.
    expect(screen.queryByText(/キーボード：/)).toBeNull();
    fireEvent.keyDown(document.body, { key: 'Enter' });
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(store()).toMatchObject({ showingAnswer: false, currentIndex: 0, results: {} });
    fireEvent.click(screen.getByRole('radio', { name: 'スライドショー（自己採点）' }));
    expect(screen.getByRole('button', { name: '答えを見る' })).toBeInTheDocument();
    expect(screen.getByText(/キーボード：/)).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(store().showingAnswer).toBe(true);
  });
  it('always offers a way out of a running exam and asks before dropping answers', async () => {
    const confirmed = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await openQuiz();
    answerFirstChoice();
    expect(screen.getByText('2 / 10')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'スライドショー（自己採点）' }));
    expect(confirmed).toHaveBeenCalledTimes(1);
    expect(screen.getByText('2 / 10')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'やめる' }));
    expect(confirmed).toHaveBeenCalledTimes(2);
    expect(screen.getByText('2 / 10')).toBeInTheDocument();
    confirmed.mockReturnValue(true);
    fireEvent.click(screen.getByRole('radio', { name: 'スライドショー（自己採点）' }));
    expect(store().exam).toBeNull();
    expect(screen.getByRole('button', { name: '答えを見る' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '選択肢' })).toBeNull();
  });
  it('hands the focus to the quiz settings when a quiz is quit', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await openQuiz();
    answerFirstChoice();
    fireEvent.click(screen.getByRole('button', { name: 'やめる' }));
    expect(store().exam).toBeNull();
    // The quit button is gone with the question, so the focus cannot be left on it.
    await waitFor(() => expect(screen.getByRole('heading', { name: '判別テストの設定' })).toHaveFocus());
  });
  it('ends the exam when the tool is left, as the intro promises', async () => {
    const view = await openQuiz();
    answerFirstChoice();
    expect(store().exam?.answers).toHaveLength(1);
    view.unmount();
    expect(store().exam).toBeNull();
    // Coming back shows the slideshow, with no off-screen exam left to confirm away.
    const confirmed = vi.spyOn(window, 'confirm');
    render(createElement(GameSpeciesTestClient));
    await screen.findByRole('button', { name: '答えを見る' });
    expect(screen.queryByRole('group', { name: '選択肢' })).toBeNull();
    // The settings wait closed below the slideshow; opening them is part of starting over.
    fireEvent.click(screen.getByRole('button', { name: /^出題設定/ }));
    fireEvent.click(screen.getByRole('button', { name: 'この設定で開始（45 問）' }));
    expect(confirmed).not.toHaveBeenCalled();
  });
  it('repeats an exam with the settings it started with, and shows the settings only to change them', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await openQuiz();
    for (let question = 0; question < 10; question++) answerFirstChoice();
    await screen.findByRole('heading', { name: 'テスト結果' });
    // The settings sit beside the start button only, so nothing on the results screen can change
    // what "the same settings" means.
    expect(screen.queryByRole('group', { name: '出題数' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '同じ設定でもう一度' }));
    expect(screen.getByText('1 / 10')).toBeInTheDocument();
    expect(store().exam).toMatchObject({ questionCount: 10, timeLimit: null });
    for (let question = 0; question < 10; question++) answerFirstChoice();
    await screen.findByRole('heading', { name: 'テスト結果' });
    fireEvent.click(screen.getByRole('button', { name: '設定を変えて始める' }));
    expect(store().exam).toBeNull();
    // The button went with the results; the focus lands on the settings it led to.
    await waitFor(() => expect(screen.getByRole('heading', { name: '判別テストの設定' })).toHaveFocus());
    expect(screen.getByRole('group', { name: '出題数' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'テストを開始（10 問）' })).toBeInTheDocument();
  });
  it('offers the missed species for review in one tap, straight under the score', async () => {
    await openQuiz();
    const missed = store().exam?.questions.map((question) => question.image) ?? [];
    for (let question = 0; question < 10; question++)
      fireEvent.click(screen.getByRole('button', { name: 'わからない（未回答で次へ）' }));
    await screen.findByRole('heading', { name: 'テスト結果' });
    const buttons = screen.getAllByRole('button').map((button) => button.textContent);
    // Before the list it could otherwise be picked from.
    expect(buttons.indexOf('間違えた 10 種をスライドショーで復習')).toBeLessThan(
      buttons.indexOf('選んだ 10 問をスライドショーで復習'),
    );
    fireEvent.click(screen.getByRole('button', { name: '間違えた 10 種をスライドショーで復習' }));
    expect(store().exam).toBeNull();
    expect(store().mode).toBe('review');
    expect([...store().order].sort()).toEqual([...missed].sort());
    expect(screen.getByRole('button', { name: '答えを見る' })).toBeInTheDocument();
  });
  it('announces every question from a live region that outlives the question', async () => {
    await openQuiz();
    const announcer = liveRegion();
    expect(announcer).toHaveTextContent('1 問目');
    answerFirstChoice();
    expect(liveRegion()).toBe(announcer);
    expect(announcer).toHaveTextContent('2 問目');
  });
});
