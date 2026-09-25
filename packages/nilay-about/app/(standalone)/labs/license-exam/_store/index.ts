import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import {
  drawDaily,
  drawMock,
  drawPrompts,
  dueQuestions,
  mockBlueprint,
  nextProgress,
  questionsFor,
  scoreSession,
  type StudySession,
} from '@/lib/license-exam';
import {
  licenceTypeSchema,
  questionProgressSchema,
  studyAreaSchema,
  studyExamSchema,
  studySessionSchema,
} from '@/lib/schemas/license-exam';
import type { DateKey } from '@/lib/study-log';

import { studyQuestions, studyQuestionsById } from '../questions';

export const storageKey = 'nilay-labs-license-exam-v1';

const lookup = (id: string) => studyQuestionsById.get(id);

export const optionsSchema = z.object({
  exam: studyExamSchema,
  licence: licenceTypeSchema,
  partial: z.boolean(),
  area: z.union([z.literal('all'), studyAreaSchema]),
  // null asks for every question in scope.
  count: z.number().int().positive().nullable(),
});
export type StudyOptions = z.infer<typeof optionsSchema>;

/**
 * A saved session is checked against the questions as they are now. A question that has gone, or
 * whose shown choices are no longer among its choices, was rewritten: the session is discarded and
 * the reader told, rather than asked the old wording.
 */
const savedSessionSchema = studySessionSchema.refine(
  (session) =>
    session.prompts.every((prompt) => {
      const question = lookup(prompt.id);
      return question !== undefined && prompt.choices.every((choice) => question.choices.includes(choice));
    }),
  { message: 'The saved session refers to questions that have since changed' },
);

const savedSchema = z.object({
  options: optionsSchema,
  session: savedSessionSchema.nullable(),
  // Progress on a question that no longer exists is dropped, not a reason to lose the rest.
  progress: z
    .record(z.string(), questionProgressSchema)
    .transform((entries) => Object.fromEntries(Object.entries(entries).filter(([id]) => lookup(id) !== undefined))),
});
type SavedState = z.infer<typeof savedSchema>;

export const initialLicenseExamState: SavedState = {
  options: { exam: 'hunting', licence: 'trap', partial: false, area: 'all', count: 10 },
  session: null,
  progress: {},
};

/** The pool the current options draw on, before any area is chosen. */
export const poolFor = (options: Pick<StudyOptions, 'exam' | 'licence'>) =>
  questionsFor(studyQuestions, options.exam, options.licence);

const newSession = (
  options: StudyOptions,
  mode: StudySession['mode'],
  prompts: { id: string; choices: string[] }[],
  timed: { startedAt: number; limitMinutes: number } | null = null,
): StudySession | null =>
  prompts.length
    ? {
        mode,
        exam: options.exam,
        licence: options.licence,
        partial: mode === 'mock' && options.exam === 'hunting' && options.partial,
        prompts,
        answers: prompts.map(() => null),
        current: 0,
        revealed: false,
        flagged: [],
        startedAt: timed?.startedAt ?? null,
        limitMinutes: timed?.limitMinutes ?? null,
        finished: false,
      }
    : null;

interface LicenseExamStore extends SavedState {
  setOptions: (options: StudyOptions) => void;
  startPractice: (random?: () => number) => void;
  startDaily: (today: DateKey) => void;
  startReview: (today: DateKey, random?: () => number) => void;
  /** Practice on exactly these questions, such as the ones just missed. */
  startWith: (ids: readonly string[], random?: () => number) => void;
  startMock: (now: number, random?: () => number) => void;
  /** Practice: answer and reveal. Mock: mark (or change) the answer, revealing nothing. */
  answer: (choice: string | null, today: DateKey) => void;
  /** Practice: leave the revealed answer for the next question, or the results. */
  advance: () => void;
  /** Mock: move to a question. */
  goTo: (index: number) => void;
  toggleFlag: (id: string) => void;
  /** Mock: hand in, mark every question and schedule it for review. */
  finish: (today: DateKey) => void;
  exit: () => void;
  resetProgress: () => void;
}

export const useLicenseExamStore = create<LicenseExamStore>()(
  persist(
    (set, get) => ({
      ...initialLicenseExamState,
      setOptions: (options) => {
        const parsed = optionsSchema.safeParse(options);
        if (parsed.success) set({ options: parsed.data });
      },
      startPractice: (random = Math.random) => {
        const { options } = get();
        const pool = poolFor(options).filter((question) => options.area === 'all' || question.area === options.area);
        const session = newSession(options, 'practice', drawPrompts(pool, options.count ?? pool.length, random));
        if (session) set({ session });
      },
      startDaily: (today) => {
        const { options } = get();
        const session = newSession(options, 'daily', drawDaily(poolFor(options), today, options.exam, options.licence));
        if (session) set({ session });
      },
      startReview: (today, random = Math.random) => {
        const { options, progress } = get();
        const due = dueQuestions(poolFor(options), progress, today);
        // The review takes every question due: cutting it short would leave some due with no way in.
        const session = newSession(options, 'review', drawPrompts(due, due.length, random));
        if (session) set({ session });
      },
      startWith: (ids, random = Math.random) => {
        const { options, session } = get();
        const wanted = new Set(ids);
        const pool = studyQuestions.filter((question) => wanted.has(question.id));
        // Kept on the exam and licence of the session being retried, not whatever the settings say now.
        const base = session ? { ...options, exam: session.exam, licence: session.licence } : options;
        const next = newSession(base, 'practice', drawPrompts(pool, pool.length, random));
        if (next) set({ session: next });
      },
      startMock: (now, random = Math.random) => {
        const { options } = get();
        const blueprint = mockBlueprint(options.exam, options.partial);
        const prompts = drawMock(poolFor(options), blueprint, random);
        if (!prompts) return;
        const session = newSession(options, 'mock', prompts, { startedAt: now, limitMinutes: blueprint.minutes });
        if (session) set({ session });
      },
      answer: (choice, today) => {
        const { session, progress } = get();
        if (!session || session.finished || session.current >= session.prompts.length) return;
        const prompt = session.prompts[session.current];
        if (!prompt || (choice !== null && !prompt.choices.includes(choice))) return;
        const answers = session.answers.map((given, index) => (index === session.current ? choice : given));
        if (session.mode === 'mock') {
          set({ session: { ...session, answers } });
          return;
        }
        if (session.revealed) return;
        const question = lookup(prompt.id);
        set({
          session: { ...session, answers, revealed: true },
          progress: question
            ? { ...progress, [prompt.id]: nextProgress(progress[prompt.id], choice === question.answer, today) }
            : progress,
        });
      },
      advance: () => {
        const { session } = get();
        if (!session || session.mode === 'mock' || !session.revealed) return;
        const current = session.current + 1;
        set({ session: { ...session, current, revealed: false, finished: current >= session.prompts.length } });
      },
      goTo: (index) => {
        const { session } = get();
        if (!session || session.mode !== 'mock' || session.finished) return;
        if (index < 0 || index >= session.prompts.length) return;
        set({ session: { ...session, current: index } });
      },
      toggleFlag: (id) => {
        const { session } = get();
        if (!session || session.finished) return;
        const flagged = session.flagged.includes(id)
          ? session.flagged.filter((flag) => flag !== id)
          : [...session.flagged, id];
        set({ session: { ...session, flagged } });
      },
      finish: (today) => {
        const { session, progress } = get();
        if (!session || session.mode !== 'mock' || session.finished) return;
        const next = { ...progress };
        session.prompts.forEach((prompt, index) => {
          const question = lookup(prompt.id);
          if (question)
            next[prompt.id] = nextProgress(next[prompt.id], session.answers[index] === question.answer, today);
        });
        set({ session: { ...session, finished: true }, progress: next });
      },
      exit: () => set({ session: null }),
      resetProgress: () => set({ progress: {} }),
    }),
    {
      // No `version`: bumping it drops old data before `merge` runs, so a migration would have to
      // report the discard from `migrate` or a saved record would vanish quietly.
      name: storageKey,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: ({ options, session, progress }) => ({ options, session, progress }),
      merge: (saved, current) => {
        const parsed = savedSchema.safeParse(saved);
        if (parsed.success) return { ...current, ...parsed.data };
        if (saved !== undefined) reportDiscardedSave(storageKey);
        return current;
      },
    },
  ),
);

export const sessionScore = (session: StudySession | null) => (session ? scoreSession(session, lookup) : null);
