import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { quizList, type Quiz } from '@/features/game-species/quiz-data';
import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { shuffleArray } from '@/lib/utils/array';

import { buildExamQuestions, type ExamQuestion } from '../exam';

export type { Quiz };
export const speciesStorageKey = 'nilay-labs-species-v1';
export type ExamTimeLimit = 5 | 10 | null;
const images = new Set(quizList.map((quiz) => quiz.image));
const imageSchema = z.string().refine((image) => images.has(image));
export const sessionOptionsSchema = z.object({
  category: z.enum(['all', 'birds', 'mammals']).default('all'),
  questionCount: z.number().int().positive().max(quizList.length).nullable().default(null),
});
export type SessionOptions = z.infer<typeof sessionOptionsSchema>;
export const examOptionsSchema = sessionOptionsSchema.extend({
  timeLimit: z.union([z.literal(5), z.literal(10), z.null()]).default(10),
});
export type ExamOptions = z.infer<typeof examOptionsSchema>;
export interface ExamSession {
  category: SessionOptions['category'];
  questionCount: SessionOptions['questionCount'];
  timeLimit: ExamTimeLimit;
  questions: ExamQuestion[];
  answers: (string | null)[];
}
const savedSchema = z
  .object({
    order: z.array(imageSchema).refine((order) => new Set(order).size === order.length),
    currentIndex: z.number().int().nonnegative(),
    results: z.record(imageSchema, z.boolean()),
    sessionAnswers: z.record(imageSchema, z.boolean()),
    mode: z.enum(['all', 'review']),
    ...sessionOptionsSchema.shape,
    interval: z.union([z.literal(3), z.literal(5), z.literal(10)]),
  })
  .refine(
    (state) =>
      state.currentIndex <= state.order.length &&
      Object.keys(state.sessionAnswers).every((id) => state.order.includes(id)),
  );

type SavedState = z.infer<typeof savedSchema>;
interface GameSpeciesStore extends SavedState {
  showingAnswer: boolean;
  autoPlay: boolean;
  exam: ExamSession | null;
  start: (mode: 'all' | 'review', options?: SessionOptions) => void;
  startSelected: (images: string[]) => void;
  reveal: () => void;
  rate: (known: boolean) => void;
  next: () => void;
  previous: () => void;
  setAutoPlay: (enabled: boolean) => void;
  setInterval: (seconds: 3 | 5 | 10) => void;
  startExam: (options: ExamOptions, random?: () => number) => void;
  answerExam: (choice: string | null) => void;
  exitExam: () => void;
}

export const initialGameSpeciesState: SavedState = {
  order: [],
  currentIndex: 0,
  results: {},
  sessionAnswers: {},
  mode: 'all',
  category: 'all',
  questionCount: null,
  interval: 3,
};

export const useGameSpeciesStore = create<GameSpeciesStore>()(
  persist(
    (set, get) => ({
      ...initialGameSpeciesState,
      showingAnswer: false,
      autoPlay: false,
      exam: null,
      // Starting or reviewing a slideshow leaves `exam` alone: ending a quiz costs the user their answers,
      // so the caller decides and asks first instead of a slideshow action dropping it as a side effect.
      start: (mode, options = get()) => {
        const parsed = sessionOptionsSchema.safeParse(options);
        if (!parsed.success) return;
        const { category, questionCount } = parsed.data;
        const candidates = quizList.filter(
          (quiz) =>
            (category === 'all' || quiz.category === category) &&
            (mode === 'all' || get().results[quiz.image] === false),
        );
        const order = shuffleArray(candidates)
          .slice(0, questionCount ?? candidates.length)
          .map((quiz) => quiz.image);
        if (!order.length) return;
        set({
          order,
          mode,
          category,
          questionCount,
          currentIndex: 0,
          sessionAnswers: {},
          showingAnswer: false,
          autoPlay: false,
        });
      },
      startSelected: (selected) => {
        const order = shuffleArray([...new Set(selected)].filter((id) => images.has(id)));
        if (!order.length) return;
        set({
          order,
          mode: 'review',
          currentIndex: 0,
          sessionAnswers: {},
          showingAnswer: false,
          autoPlay: false,
        });
      },
      reveal: () => set({ showingAnswer: true }),
      rate: (known) => {
        const state = get();
        const id = state.order[state.currentIndex];
        if (!id || !state.showingAnswer) return;
        set({
          results: { ...state.results, [id]: known },
          sessionAnswers: { ...state.sessionAnswers, [id]: known },
          autoPlay: false,
        });
        get().next();
      },
      next: () => {
        const { currentIndex, order } = get();
        if (currentIndex >= order.length) return;
        set({
          currentIndex: currentIndex + 1,
          showingAnswer: false,
          ...(currentIndex + 1 === order.length ? { autoPlay: false } : {}),
        });
      },
      previous: () =>
        set((state) => ({ currentIndex: Math.max(0, state.currentIndex - 1), showingAnswer: false, autoPlay: false })),
      setAutoPlay: (autoPlay) => set({ autoPlay }),
      setInterval: (interval) => set({ interval }),
      startExam: (options, random = Math.random) => {
        const parsed = examOptionsSchema.safeParse(options);
        if (!parsed.success) return;
        const { category, questionCount, timeLimit } = parsed.data;
        const pool = quizList.filter((quiz) => category === 'all' || quiz.category === category);
        const questions = buildExamQuestions(pool, questionCount ?? pool.length, random);
        if (!questions.length) return;
        // The session keeps its own settings so repeating it cannot pick up later edits in the sidebar.
        set({ exam: { category, questionCount, timeLimit, questions, answers: [] }, autoPlay: false });
      },
      answerExam: (choice) => {
        const { exam, results } = get();
        if (!exam || exam.answers.length >= exam.questions.length) return;
        const answers = [...exam.answers, choice];
        const missed = exam.questions.filter((question, index) => answers[index] !== question.answer);
        set({
          exam: { ...exam, answers },
          // Only missed species join the review list, so the exam never overwrites a self assessment.
          ...(answers.length === exam.questions.length
            ? { results: { ...results, ...Object.fromEntries(missed.map((question) => [question.image, false])) } }
            : {}),
        });
      },
      exitExam: () => set({ exam: null }),
    }),
    {
      // No `version` is declared on purpose: bumping it drops old data before `merge` runs, so a future
      // migration has to report the discard from `migrate` or every saved record vanishes quietly.
      name: speciesStorageKey,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: ({ order, currentIndex, results, sessionAnswers, mode, interval, category, questionCount }) => ({
        order,
        currentIndex,
        results,
        sessionAnswers,
        mode,
        interval,
        category,
        questionCount,
      }),
      // The exam is left out on purpose: a timed session cannot be resumed halfway, so a reload discards it.
      merge: (saved, current) => {
        const parsed = savedSchema.safeParse(saved);
        if (parsed.success) return { ...current, ...parsed.data, autoPlay: false, showingAnswer: false };
        // persist also calls merge with nothing stored, which is a first visit. Only data that was there
        // and no longer matches the schema is a discarded save worth telling the reader about.
        if (saved !== undefined) reportDiscardedSave(speciesStorageKey);
        return current;
      },
    },
  ),
);
