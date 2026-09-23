import { lawQuizCategoryFamily } from './schemas/law-quiz';
import type { LawQuestion, LawQuizScope, LawQuizSession } from './schemas/law-quiz';

export type {
  LawKey,
  LawQuestion,
  LawQuestionSource,
  LawQuizCategory,
  LawQuizFamily,
  LawQuizOptions,
  LawQuizScope,
  LawQuizSession,
} from './schemas/law-quiz';

/**
 * The questions themselves live with the screen that asks them, so this module never imports
 * them: it works on whatever pool it is handed. That keeps the arithmetic testable against a
 * handful of made-up questions, and it keeps a library from depending on a page.
 */

/** A question as it was put to the reader: which one, and in what order its choices stood. */
export interface QuizPrompt {
  id: string;
  choices: readonly string[];
}

// shuffleArray in lib/utils/array always draws from Math.random, so the quiz keeps its own
// injectable source: a test that cannot fix the order cannot check the order.
function shuffleWith<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    const held = result[index] as T;
    result[index] = result[swap] as T;
    result[swap] = held;
  }
  return result;
}

/**
 * The questions a scope asks for: every one, the ones read from a single statute, or the ones
 * in a single area of one. A statute is matched through the area each question belongs to, so a
 * question never has to name its statute twice.
 */
export function questionsInScope(pool: readonly LawQuestion[], scope: LawQuizScope): LawQuestion[] {
  if (scope === 'all') return [...pool];
  return pool.filter((question) => question.category === scope || lawQuizCategoryFamily[question.category] === scope);
}

/**
 * Draw a session from the pool: no question twice, and the choices shuffled for each one so
 * that the position of the right answer carries no information from one sitting to the next.
 *
 * A count above what the scope holds gives the whole scope rather than an error; the screen
 * only offers counts it has, and a saved setting can outlive the questions it was chosen for.
 */
export function buildQuizPrompts(
  pool: readonly LawQuestion[],
  count: number,
  random: () => number = Math.random,
): QuizPrompt[] {
  const wanted = Number.isFinite(count) ? Math.floor(count) : 0;
  return shuffleWith(pool, random)
    .slice(0, Math.max(0, Math.min(wanted, pool.length)))
    .map((question) => ({ id: question.id, choices: shuffleWith(question.choices, random) }));
}

export interface QuizAnswer {
  id: string;
  /** What was chosen, or null where the reader moved on without answering. */
  choice: string | null;
  correct: boolean;
}

export interface QuizScore {
  answered: number;
  correct: number;
  wrong: number;
  unanswered: number;
  /** The questions to review: the ones answered wrongly and the ones left unanswered. */
  missed: QuizAnswer[];
}

/**
 * Score what has been answered so far. Questions not yet reached are not counted at all, so the
 * same function serves the running tally during a session and the summary at the end of one.
 *
 * A prompt whose question has since disappeared from the pool is dropped rather than counted
 * wrong: it is the question that went away, not the reader who erred.
 */
export function scoreQuiz(
  prompts: readonly QuizPrompt[],
  answers: readonly (string | null)[],
  lookup: (id: string) => LawQuestion | undefined,
): QuizScore {
  const graded = prompts.slice(0, answers.length).flatMap((prompt, index): QuizAnswer[] => {
    const question = lookup(prompt.id);
    if (question === undefined) return [];
    const choice = answers[index] ?? null;
    return [{ id: prompt.id, choice, correct: choice === question.answer }];
  });
  const missed = graded.filter((answer) => !answer.correct);
  return {
    answered: graded.length,
    correct: graded.length - missed.length,
    wrong: missed.filter((answer) => answer.choice !== null).length,
    unanswered: missed.filter((answer) => answer.choice === null).length,
    missed,
  };
}

/** Whether every question in the session has been answered, which is what ends it. */
export function isSessionComplete(session: LawQuizSession): boolean {
  return session.answers.length >= session.prompts.length;
}

/**
 * The question the reader is on: the first one not yet answered. A finished session has none,
 * which is how the screen knows to show the results instead.
 */
export function currentPrompt(session: LawQuizSession): QuizPrompt | null {
  return isSessionComplete(session) ? null : (session.prompts[session.answers.length] ?? null);
}
