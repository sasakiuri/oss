import { quizList, type Quiz } from '@/features/game-species/quiz-data';

export const examChoiceCount = 4;

export interface ExamQuestion {
  image: string;
  answer: string;
  choices: string[];
}

// shuffleArray in lib/utils/array always draws from Math.random, so the exam keeps its own injectable source.
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

export function buildExamQuestions(
  pool: readonly Quiz[],
  count: number,
  random: () => number = Math.random,
  species: readonly Quiz[] = quizList,
): ExamQuestion[] {
  return shuffleWith(pool, random)
    .slice(0, Math.max(0, Math.min(count, pool.length)))
    .map((quiz) => {
      const others = species.filter((other) => other.answer !== quiz.answer);
      const wrong = [
        ...shuffleWith(
          others.filter((other) => other.category === quiz.category),
          random,
        ),
        // A category with fewer than four species borrows the remaining wrong choices from the other category.
        ...shuffleWith(
          others.filter((other) => other.category !== quiz.category),
          random,
        ),
      ].slice(0, examChoiceCount - 1);
      return {
        image: quiz.image,
        answer: quiz.answer,
        choices: shuffleWith([quiz.answer, ...wrong.map((other) => other.answer)], random),
      };
    });
}
