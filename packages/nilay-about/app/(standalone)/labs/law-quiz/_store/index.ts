import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { buildQuizPrompts, questionsInScope, scoreQuiz } from '@/lib/law-quiz';
import {
  lawQuizOptionsSchema,
  lawQuizScopeSchema,
  lawQuizSessionSchema,
  type LawQuizScope,
  type LawQuizSession,
} from '@/lib/schemas/law-quiz';

import { lawQuestions, lawQuestionsById } from '../questions';

export const storageKey = 'nilay-labs-law-quiz-v1';

const lookup = (id: string) => lawQuestionsById.get(id);

/**
 * A saved session is checked against the questions as they stand now, not as they stood when it
 * was written. An id that no longer exists, or a set of choices that no longer matches the
 * article, means the question was rewritten after an amendment: the session is then discarded
 * and said to be discarded, rather than quietly asking the reader about a repealed rule.
 */
const savedSessionSchema = lawQuizSessionSchema.refine(
  (session) =>
    session.prompts.every((prompt) => {
      const question = lookup(prompt.id);
      if (question === undefined) return false;
      const shown = [...prompt.choices].sort();
      const current = [...question.choices].sort();
      return shown.length === current.length && shown.every((choice, index) => choice === current[index]);
    }),
  { message: 'The saved session refers to questions that have since changed' },
);

const savedSchema = z.object({
  options: lawQuizOptionsSchema,
  session: savedSessionSchema.nullable(),
  // Ids of questions to go back to. Unknown ids are dropped rather than failing the whole save,
  // because a review list is a convenience and losing a settings file over one is not a trade.
  reviewIds: z.array(z.string()).transform((ids) => ids.filter((id) => lookup(id) !== undefined)),
});
type SavedState = z.infer<typeof savedSchema>;

interface LawQuizStore extends SavedState {
  setScope: (scope: LawQuizScope) => void;
  setQuestionCount: (count: number | null) => void;
  /** Draw a new session from the current options. Does nothing when the scope holds no questions. */
  start: (random?: () => number) => void;
  /** Draw a session from the questions marked for review. */
  startReview: (ids?: readonly string[], random?: () => number) => void;
  /** Record an answer, or null for a question the reader moved on from, and reveal the article. */
  answer: (choice: string | null) => void;
  /** Leave the revealed article and move to the next question, or to the results. */
  advance: () => void;
  exit: () => void;
  clearReview: () => void;
}

export const initialLawQuizState: SavedState = {
  options: { scope: 'all', questionCount: 10 },
  session: null,
  reviewIds: [],
};

const drawSession = (
  pool: readonly (typeof lawQuestions)[number][],
  scope: LawQuizScope,
  count: number | null,
  random: () => number,
): LawQuizSession | null => {
  const prompts = buildQuizPrompts(pool, count ?? pool.length, random);
  if (!prompts.length) return null;
  return { scope, prompts, answers: [], revealed: false };
};

export const useLawQuizStore = create<LawQuizStore>()(
  persist(
    (set, get) => ({
      ...initialLawQuizState,
      setScope: (scope) => {
        const parsed = lawQuizScopeSchema.safeParse(scope);
        if (parsed.success) set({ options: { ...get().options, scope: parsed.data } });
      },
      setQuestionCount: (questionCount) => set({ options: { ...get().options, questionCount } }),
      start: (random = Math.random) => {
        const { scope, questionCount } = get().options;
        const session = drawSession(questionsInScope(lawQuestions, scope), scope, questionCount, random);
        if (session) set({ session });
      },
      startReview: (ids = get().reviewIds, random = Math.random) => {
        const wanted = new Set(ids);
        const pool = lawQuestions.filter((question) => wanted.has(question.id));
        // The review takes every question asked for: narrowing it to the usual count would leave
        // the rest marked for review with no way to reach them.
        const session = drawSession(pool, get().options.scope, pool.length, random);
        if (session) set({ session });
      },
      answer: (choice) => {
        const { session, reviewIds } = get();
        if (!session || session.revealed || session.answers.length >= session.prompts.length) return;
        const prompt = session.prompts[session.answers.length];
        if (!prompt) return;
        const question = lookup(prompt.id);
        const missed = question === undefined || choice !== question.answer;
        set({
          session: { ...session, answers: [...session.answers, choice], revealed: true },
          // A correct answer never clears the mark, the same way the species slideshow leaves a
          // self assessment alone: getting it right once is not evidence the article is known.
          reviewIds: missed && !reviewIds.includes(prompt.id) ? [...reviewIds, prompt.id] : reviewIds,
        });
      },
      advance: () => {
        const { session } = get();
        if (!session || !session.revealed) return;
        set({ session: { ...session, revealed: false } });
      },
      exit: () => set({ session: null }),
      clearReview: () => set({ reviewIds: [] }),
    }),
    {
      // No `version` is declared on purpose: bumping it drops old data before `merge` runs, so a
      // future migration has to report the discard from `migrate` or a saved session vanishes quietly.
      name: storageKey,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: ({ options, session, reviewIds }) => ({ options, session, reviewIds }),
      merge: (saved, current) => {
        const parsed = savedSchema.safeParse(saved);
        if (parsed.success) return { ...current, ...parsed.data };
        // persist also calls merge with nothing stored, which is a first visit. Only data that was
        // there and no longer matches is a discarded save worth telling the reader about.
        if (saved !== undefined) reportDiscardedSave(storageKey);
        return current;
      },
    },
  ),
);

/** The running score of the session, or null when there is no session to score. */
export const sessionScore = (session: LawQuizSession | null) =>
  session ? scoreQuiz(session.prompts, session.answers, lookup) : null;
