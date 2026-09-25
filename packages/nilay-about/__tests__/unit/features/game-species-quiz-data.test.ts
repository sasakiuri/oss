import { describe, expect, it } from 'vitest';

import { quizList } from '@/features/game-species/quiz-data';
import { GAME_SPECIES } from '@/lib/schemas/hunting-log';

// An answer names one species, or two that share a question ('ノウサギ・ユキウサギ').
// A qualifier in brackets ('イタチ（オス）') is not part of the name.
const namesOf = (answer: string) => answer.replace(/（.*）$/, '').split('・');

describe('game species quiz data', () => {
  it('asks exactly the current game species, the same list the hunting log uses', () => {
    const asked = quizList.flatMap((quiz) => namesOf(quiz.answer)).sort();
    const gameSpecies = GAME_SPECIES.map((species) => species.name).sort();

    expect(asked).toEqual(gameSpecies);
  });

  it('files each species under the same group as the hunting log', () => {
    const groupOf = new Map<string, string>(GAME_SPECIES.map((species) => [species.name, species.group]));

    for (const quiz of quizList) {
      for (const name of namesOf(quiz.answer)) {
        expect(groupOf.get(name)).toBe(quiz.category === 'birds' ? 'bird' : 'mammal');
      }
    }
  });

  it('uses each photo once', () => {
    expect(new Set(quizList.map((quiz) => quiz.image)).size).toBe(quizList.length);
  });
});
