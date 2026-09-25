import { nonGameList, type NonGame } from '@/features/game-species/non-game';
import { quizList, type Quiz } from '@/features/game-species/quiz-data';

import { examChoiceCount } from './exam';

/**
 * The exam-style identification: game and non-game species mixed, and two steps for each photo,
 * as prefectures describe the licence exam (Kochi: 16 pictures, about 5 seconds each, mark whether
 * each may be hunted, and name the game species). Step one is "game species or not"; only a "game
 * species" answer goes on to step two, picking the name.
 *
 * The number of points taken off per mistake is not published, so the test counts mistakes by
 * kind instead of scoring them.
 */

/** Pictures per test, as in the prefectural notices. */
export const JUDGE_COUNT = 16;

export interface JudgeQuestion {
  image: string;
  /** The species' name, game or not. */
  name: string;
  game: boolean;
  /** Names offered in step two: game species only, one of them right when the photo is one. */
  choices: string[];
}

/** One answer: whether it was called a game species (null if time ran out) and the name picked. */
export interface JudgeAnswer {
  game: boolean | null;
  name: string | null;
}

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
 * Draw a test from game and non-game species together. Step two for a non-game photo offers the
 * game species it is most often mistaken for among the names, so calling it a game species leads
 * to a plausible wrong name rather than an obvious one.
 */
export function buildJudgeQuestions(
  category: Quiz['category'] | 'all',
  count: number,
  random: () => number = Math.random,
  game: readonly Quiz[] = quizList,
  nonGame: readonly NonGame[] = nonGameList,
): JudgeQuestion[] {
  const inCategory = <T extends { category: Quiz['category'] }>(items: readonly T[]) =>
    items.filter((item) => category === 'all' || item.category === category);
  interface Drawn {
    image: string;
    name: string;
    game: boolean;
    category: Quiz['category'];
    lookalike?: string;
  }
  const pool: Drawn[] = [
    ...inCategory(game).map((quiz) => ({ image: quiz.image, name: quiz.answer, game: true, category: quiz.category })),
    ...inCategory(nonGame).map((item) => ({
      image: item.image,
      name: item.name,
      game: false,
      category: item.category,
      lookalike: item.lookalike,
    })),
  ];
  return shuffleWith(pool, random)
    .slice(0, Math.max(0, Math.min(count, pool.length)))
    .map((item) => {
      const sameGroup = game.filter((quiz) => quiz.category === item.category && quiz.answer !== item.name);
      const anchor = item.game ? item.name : item.lookalike;
      const others = shuffleWith(
        sameGroup.filter((quiz) => quiz.answer !== anchor),
        random,
      ).map((quiz) => quiz.answer);
      const names: string[] = anchor ? [anchor, ...others] : others;
      return {
        image: item.image,
        name: item.name,
        game: item.game,
        choices: shuffleWith(names.slice(0, examChoiceCount), random),
      };
    });
}

export type JudgeVerdict = 'correct' | 'wrongStatus' | 'wrongName' | 'unanswered';

/** Whether an answer is right, and if not, which step went wrong. */
export function judgeVerdict(question: JudgeQuestion, answer: JudgeAnswer | undefined): JudgeVerdict {
  if (!answer || answer.game === null) return 'unanswered';
  if (answer.game !== question.game) return 'wrongStatus';
  if (!question.game) return 'correct';
  if (answer.name === null) return 'unanswered';
  return answer.name === question.name ? 'correct' : 'wrongName';
}

export function scoreJudge(questions: readonly JudgeQuestion[], answers: readonly JudgeAnswer[]) {
  const tally: Record<JudgeVerdict, number> = { correct: 0, wrongStatus: 0, wrongName: 0, unanswered: 0 };
  questions.forEach((question, index) => {
    tally[judgeVerdict(question, answers[index])] += 1;
  });
  return tally;
}
