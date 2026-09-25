import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildJudgeQuestions,
  JUDGE_COUNT,
  judgeVerdict,
  scoreJudge,
} from '@/app/(standalone)/labs/game-species-test/judge';
import { nonGameList } from '@/features/game-species/non-game';
import { quizList } from '@/features/game-species/quiz-data';

const publicDir = path.resolve(__dirname, '../../../public');
const gameNames = quizList.flatMap((quiz) => quiz.answer.split('・'));

describe('the non-game species', () => {
  it('are none of the game species, each with a photo on disk', () => {
    for (const item of nonGameList) {
      expect({ name: item.name, game: gameNames.includes(item.name) }).toEqual({ name: item.name, game: false });
      expect({ image: item.image, exists: existsSync(path.join(publicDir, item.image)) }).toEqual({
        image: item.image,
        exists: true,
      });
    }
    expect(new Set(nonGameList.map((item) => item.image)).size).toBe(nonGameList.length);
  });

  it('are set beside a game species of the same group', () => {
    for (const item of nonGameList.filter((entry) => entry.lookalike)) {
      const game = quizList.find((quiz) => quiz.answer === item.lookalike);
      expect({ name: item.name, lookalike: game?.category }).toEqual({ name: item.name, lookalike: item.category });
    }
  });
});

describe('the exam-style test', () => {
  it('mixes game and non-game species without repeats, offering the right name for a game species', () => {
    const questions = buildJudgeQuestions('all', JUDGE_COUNT, () => 0.42);
    expect(questions).toHaveLength(JUDGE_COUNT);
    expect(new Set(questions.map((question) => question.image)).size).toBe(JUDGE_COUNT);
    const many = buildJudgeQuestions('all', 200);
    expect(many.some((question) => question.game)).toBe(true);
    expect(many.some((question) => !question.game)).toBe(true);
    for (const question of many) {
      expect(question.choices).toHaveLength(4);
      for (const choice of question.choices) expect(quizList.map((quiz) => quiz.answer)).toContain(choice);
      expect(!question.game || question.choices.includes(question.name)).toBe(true);
    }
  });

  it('keeps to mammals for the trap licence', () => {
    for (const question of buildJudgeQuestions('mammals', 200)) {
      const species =
        quizList.find((quiz) => quiz.image === question.image) ??
        nonGameList.find((item) => item.image === question.image);
      expect(species?.category).toBe('mammals');
    }
  });

  it('marks the two steps separately', () => {
    const game = { image: 'a', name: 'マガモ', game: true, choices: ['マガモ', 'コガモ', 'カルガモ', 'ヨシガモ'] };
    const other = { image: 'b', name: 'オシドリ', game: false, choices: ['マガモ', 'コガモ', 'カルガモ', 'ヨシガモ'] };
    expect(judgeVerdict(game, { game: true, name: 'マガモ' })).toBe('correct');
    expect(judgeVerdict(game, { game: true, name: 'コガモ' })).toBe('wrongName');
    expect(judgeVerdict(game, { game: false, name: null })).toBe('wrongStatus');
    expect(judgeVerdict(game, { game: true, name: null })).toBe('unanswered');
    expect(judgeVerdict(other, { game: false, name: null })).toBe('correct');
    expect(judgeVerdict(other, { game: true, name: 'マガモ' })).toBe('wrongStatus');
    expect(judgeVerdict(other, undefined)).toBe('unanswered');
    expect(scoreJudge([game, other], [{ game: true, name: 'マガモ' }])).toEqual({
      correct: 1,
      wrongStatus: 0,
      wrongName: 0,
      unanswered: 1,
    });
  });
});
