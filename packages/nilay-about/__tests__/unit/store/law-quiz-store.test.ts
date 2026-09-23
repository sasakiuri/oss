import { beforeEach, describe, expect, it } from 'vitest';

import { sessionScore, storageKey, useLawQuizStore } from '@/app/(standalone)/labs/law-quiz/_store';
import { lawQuestions, lawQuestionsById } from '@/app/(standalone)/labs/law-quiz/questions';
import { useStorageStatus } from '@/lib/browser-storage';

const fixed =
  (value = 0.5) =>
  () =>
    value;
const store = () => useLawQuizStore.getState();
const answerOf = (id: string) => lawQuestionsById.get(id)?.answer ?? '';

const saved = () => JSON.parse(window.localStorage.getItem(storageKey) ?? '{}') as { state?: unknown };

describe('the law quiz store', () => {
  beforeEach(() => {
    useLawQuizStore.setState(useLawQuizStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });

  it('opens on every area with a ten question session and nothing to review', () => {
    expect(store().options).toEqual({ scope: 'all', questionCount: 10 });
    expect(store().session).toBeNull();
    expect(store().reviewIds).toEqual([]);
  });

  it('draws a session of the chosen size from the chosen area', () => {
    store().setScope('safety');
    store().setQuestionCount(3);
    store().start(fixed());
    const session = store().session;
    expect(session?.scope).toBe('safety');
    expect(session?.prompts).toHaveLength(3);
    for (const prompt of session?.prompts ?? []) expect(lawQuestionsById.get(prompt.id)?.category).toBe('safety');
  });

  it('asks every question in the area when no count is set', () => {
    store().setScope('duties');
    store().setQuestionCount(null);
    store().start(fixed());
    const duties = lawQuestions.filter((question) => question.category === 'duties');
    expect(store().session?.prompts).toHaveLength(duties.length);
  });

  it('records an answer, reveals the article, and only moves on when told to', () => {
    store().setQuestionCount(2);
    store().start(fixed());
    const first = store().session?.prompts[0];
    expect(first).toBeDefined();
    store().answer(answerOf(first?.id ?? ''));
    expect(store().session?.revealed).toBe(true);
    expect(store().session?.answers).toHaveLength(1);
    // A second answer while the article is up would skip a question without the reader asking.
    store().answer('anything');
    expect(store().session?.answers).toHaveLength(1);
    store().advance();
    expect(store().session?.revealed).toBe(false);
    expect(store().session?.answers).toHaveLength(1);
  });

  it('marks a wrong answer and a skipped question for review, and leaves a right one alone', () => {
    store().setQuestionCount(3);
    store().start(fixed());
    const prompts = store().session?.prompts ?? [];
    const ids = prompts.map((prompt) => prompt.id);
    store().answer(answerOf(ids[0] ?? ''));
    store().advance();
    expect(store().reviewIds).toEqual([]);
    store().answer('まちがった答え');
    store().advance();
    store().answer(null);
    expect(store().reviewIds).toEqual([ids[1], ids[2]]);
    const score = sessionScore(store().session);
    expect(score).toMatchObject({ correct: 1, wrong: 1, unanswered: 1 });
  });

  it('keeps a question marked for review even after it is answered correctly', () => {
    store().setQuestionCount(1);
    store().start(fixed());
    const id = store().session?.prompts[0]?.id ?? '';
    store().answer('まちがった答え');
    expect(store().reviewIds).toEqual([id]);
    store().exit();
    store().startReview([id], fixed());
    store().answer(answerOf(id));
    expect(store().reviewIds).toEqual([id]);
  });

  it('reviews every question asked for, whatever the usual count is', () => {
    store().setQuestionCount(1);
    const ids = lawQuestions.slice(0, 4).map((question) => question.id);
    store().startReview(ids, fixed());
    expect(
      store()
        .session?.prompts.map((prompt) => prompt.id)
        .sort(),
    ).toEqual([...ids].sort());
  });

  it('saves the session in progress and reads it back', async () => {
    store().setQuestionCount(2);
    store().start(fixed());
    const before = store().session;
    store().answer(null);
    store().advance();
    const written = window.localStorage.getItem(storageKey);
    expect((saved().state as { session?: unknown }).session).toBeDefined();

    // Resetting the store writes the empty state back through persist, so the save is restored
    // afterwards: what is being tested is the read, not what a reset happens to leave behind.
    useLawQuizStore.setState(useLawQuizStore.getInitialState(), true);
    window.localStorage.setItem(storageKey, written ?? '');
    await useLawQuizStore.persist.rehydrate();
    expect(store().session?.prompts).toEqual(before?.prompts);
    expect(store().session?.answers).toEqual([null]);
    expect(store().reviewIds).toEqual([before?.prompts[0]?.id]);
  });

  it('discards a saved session whose questions have since been rewritten, and says so', async () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        state: {
          language: 'ja',
          options: { scope: 'all', questionCount: 10 },
          session: {
            scope: 'all',
            prompts: [
              { id: lawQuestions[0]?.id, choices: ['古い選択肢 1', '古い選択肢 2', '古い選択肢 3', '古い選択肢 4'] },
            ],
            answers: [],
            revealed: false,
          },
          reviewIds: [],
        },
        version: 0,
      }),
    );
    await useLawQuizStore.persist.rehydrate();
    expect(store().session).toBeNull();
    expect(useStorageStatus.getState().discarded).toContain(storageKey);
  });

  it('drops an unknown id from the review list without losing the rest of the save', async () => {
    const known = lawQuestions[0]?.id ?? '';
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        state: {
          language: 'en',
          options: { scope: 'methods', questionCount: 5 },
          session: null,
          reviewIds: [known, 'removed-question'],
        },
        version: 0,
      }),
    );
    await useLawQuizStore.persist.rehydrate();
    expect(store().reviewIds).toEqual([known]);
    // The save names a language, from before the setting belonged to the site. It is passed over
    // rather than making the rest of the save unreadable.
    expect(store().options.scope).toBe('methods');
    expect(useStorageStatus.getState().discarded).not.toContain(storageKey);
  });
});
