import { describe, expect, it } from 'vitest';

import {
  LAW_REFERENCES,
  LAW_TEXT_CHECKED_ON,
  lawQuestionCountByCategory,
  lawQuestions,
  lawQuestionsById,
} from '@/app/(standalone)/labs/law-quiz/questions';
import { buildQuizPrompts, currentPrompt, isSessionComplete, questionsInScope, scoreQuiz } from '@/lib/law-quiz';
import {
  lawQuestionSchema,
  lawQuizCategories,
  lawQuizCategoryFamily,
  lawQuizFamilies,
  type LawQuestion,
} from '@/lib/schemas/law-quiz';

// A fixed generator, so the shuffle can be checked instead of merely run.
const sequence = (values: number[]) => {
  let index = 0;
  return () => values[index++ % values.length] ?? 0;
};

const sample = (id: string, category: LawQuestion['category'] = 'basics'): LawQuestion => ({
  id,
  category,
  question: `${id} の問題文`,
  choices: [`${id}-a`, `${id}-b`, `${id}-c`, `${id}-d`],
  answer: `${id}-a`,
  explanation: `${id} の解説`,
  sources: [{ law: 'act', article: '第 1 条' }],
});

describe('the question data', () => {
  it('has at least thirty questions spread over every category', () => {
    expect(lawQuestions.length).toBeGreaterThanOrEqual(30);
    for (const category of lawQuizCategories) expect(lawQuestionCountByCategory[category]).toBeGreaterThan(0);
    expect(Object.values(lawQuestionCountByCategory).reduce((sum, count) => sum + count, 0)).toBe(lawQuestions.length);
  });

  it('puts every category under a statute, and leaves no statute without questions', () => {
    for (const category of lawQuizCategories) expect(lawQuizFamilies).toContain(lawQuizCategoryFamily[category]);
    for (const family of lawQuizFamilies)
      expect({ family, asked: questionsInScope(lawQuestions, family).length > 0 }).toEqual({ family, asked: true });
    // A scope is one value, so a statute that shared a name with an area could not be told from it.
    expect(lawQuizCategories.some((category) => (lawQuizFamilies as readonly string[]).includes(category))).toBe(false);
  });

  it('cites only statutes that belong to the area the question is filed under', () => {
    const lawsByFamily: Record<string, readonly string[]> = {
      wildlife: ['act', 'regulation'],
      firearms: ['gunAct', 'gunOrder', 'gunRegulation', 'rangeOrder'],
      explosives: ['powderAct', 'powderOrder', 'powderRegulation', 'huntingPowderOrder'],
      arms: ['armsAct', 'armsRegulation'],
    };
    for (const question of lawQuestions) {
      const allowed = lawsByFamily[lawQuizCategoryFamily[question.category]] ?? [];
      for (const source of question.sources)
        expect({ id: question.id, law: source.law, allowed: allowed.includes(source.law) }).toEqual({
          id: question.id,
          law: source.law,
          allowed: true,
        });
    }
  });

  it('names every statute it cites, and cites every statute it names', () => {
    const cited = new Set(lawQuestions.flatMap((question) => question.sources.map((source) => source.law)));
    expect([...Object.keys(LAW_REFERENCES)].sort()).toEqual([...cited].sort());
  });

  it('matches the question schema, so every answer is among its own choices exactly once', () => {
    for (const question of lawQuestions) {
      const parsed = lawQuestionSchema.safeParse(question);
      // The id travels in the assertion itself, so a failure names the question that broke.
      expect({ id: question.id, valid: parsed.success }).toEqual({ id: question.id, valid: true });
    }
  });

  it('gives every question an id of its own', () => {
    expect(new Set(lawQuestions.map((question) => question.id)).size).toBe(lawQuestions.length);
    expect(lawQuestionsById.size).toBe(lawQuestions.length);
  });

  it('cites a law and an article on every question, and never asks one without an explanation', () => {
    for (const question of lawQuestions) {
      expect(question.sources.length).toBeGreaterThan(0);
      for (const source of question.sources) {
        const reference = LAW_REFERENCES[source.law];
        expect(reference).toBeDefined();
        expect(reference.url).toMatch(/^https:\/\/laws\.e-gov\.go\.jp\/law\//);
        expect(reference.name.length).toBeGreaterThan(0);
        // The article has to name a numbered provision, not just the law it lives in.
        expect({ id: question.id, article: source.article }).toEqual({
          id: question.id,
          article: expect.stringMatching(/^第\s?\d+\s?条/) as unknown as string,
        });
      }
      expect(question.explanation.length).toBeGreaterThan(20);
    }
  });

  it('records the day the articles were read, as a date', () => {
    expect(LAW_TEXT_CHECKED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(LAW_TEXT_CHECKED_ON))).toBe(false);
    for (const reference of Object.values(LAW_REFERENCES)) expect(reference.revision.length).toBeGreaterThan(0);
  });

  it('explains each answer with the article the question cites, not with a bare verdict', () => {
    for (const question of lawQuestions) {
      const articles = question.sources.map((source) => source.article.replace(/\s/g, ''));
      const explanation = question.explanation.replace(/\s/g, '');
      // The leading article number has to appear in the explanation: 第 62 条第 3 項 is quoted as 第62条.
      const leading = articles.map((article) => article.match(/^第\d+条(の\d+)?/)?.[0] ?? article);
      expect({ id: question.id, cited: leading.some((article) => explanation.includes(article)) }).toEqual({
        id: question.id,
        cited: true,
      });
    }
  });
});

describe('choosing the questions for a session', () => {
  const pool = [sample('a'), sample('b'), sample('c', 'safety'), sample('d', 'safety')];

  it('narrows the pool to one category, and leaves it whole for every area', () => {
    expect(questionsInScope(pool, 'safety').map((question) => question.id)).toEqual(['c', 'd']);
    expect(questionsInScope(pool, 'all')).toHaveLength(4);
    expect(questionsInScope(pool, 'duties')).toHaveLength(0);
  });

  it('narrows the pool to one statute, taking every area that belongs to it', () => {
    const mixed = [sample('a'), sample('b', 'safety'), sample('c', 'possession'), sample('d', 'powder')];
    expect(questionsInScope(mixed, 'wildlife').map((question) => question.id)).toEqual(['a', 'b']);
    expect(questionsInScope(mixed, 'firearms').map((question) => question.id)).toEqual(['c']);
    expect(questionsInScope(mixed, 'explosives').map((question) => question.id)).toEqual(['d']);
    expect(questionsInScope(mixed, 'arms')).toHaveLength(0);
  });

  it('asks for as many questions as were requested, without repeating one', () => {
    const prompts = buildQuizPrompts(pool, 3, sequence([0.1, 0.9, 0.5, 0.3]));
    expect(prompts).toHaveLength(3);
    expect(new Set(prompts.map((prompt) => prompt.id)).size).toBe(3);
  });

  it('gives the whole pool when more questions are asked for than exist', () => {
    expect(buildQuizPrompts(pool, 99, sequence([0.5]))).toHaveLength(4);
    expect(buildQuizPrompts(pool, 0, sequence([0.5]))).toHaveLength(0);
    expect(buildQuizPrompts(pool, Number.NaN, sequence([0.5]))).toHaveLength(0);
  });

  it('keeps every choice of the question it was drawn from, in a shuffled order', () => {
    const prompts = buildQuizPrompts(pool, 4, sequence([0.7, 0.2, 0.9, 0.4]));
    for (const prompt of prompts) {
      const question = pool.find((candidate) => candidate.id === prompt.id);
      expect(question).toBeDefined();
      expect([...prompt.choices].sort()).toEqual([...(question?.choices ?? [])].sort());
      expect(prompt.choices).toContain(question?.answer);
    }
  });

  it('draws the same session twice from the same generator', () => {
    const first = buildQuizPrompts(pool, 4, sequence([0.1, 0.4, 0.8, 0.2, 0.6]));
    const second = buildQuizPrompts(pool, 4, sequence([0.1, 0.4, 0.8, 0.2, 0.6]));
    expect(first).toEqual(second);
  });

  it('shuffles the real questions without losing or duplicating any', () => {
    const prompts = buildQuizPrompts(lawQuestions, lawQuestions.length, sequence([0.13, 0.57, 0.91, 0.28]));
    expect(new Set(prompts.map((prompt) => prompt.id)).size).toBe(lawQuestions.length);
  });
});

describe('scoring', () => {
  const pool = [sample('a'), sample('b'), sample('c')];
  const lookup = (id: string) => pool.find((question) => question.id === id);
  const prompts = pool.map((question) => ({ id: question.id, choices: question.choices }));

  it('counts only the questions that have been answered so far', () => {
    const score = scoreQuiz(prompts, ['a-a'], lookup);
    expect(score).toMatchObject({ answered: 1, correct: 1, wrong: 0, unanswered: 0 });
    expect(score.missed).toHaveLength(0);
  });

  it('separates a wrong answer from a question that was skipped', () => {
    const score = scoreQuiz(prompts, ['a-a', 'b-c', null], lookup);
    expect(score).toMatchObject({ answered: 3, correct: 1, wrong: 1, unanswered: 1 });
    expect(score.missed.map((missed) => missed.id)).toEqual(['b', 'c']);
    expect(score.missed.map((missed) => missed.choice)).toEqual(['b-c', null]);
  });

  it('drops a question that has since left the pool rather than marking it wrong', () => {
    const score = scoreQuiz(
      [...prompts, { id: 'gone', choices: ['x', 'y', 'z', 'w'] }],
      ['a-a', 'b-a', 'c-a', 'x'],
      () => undefined,
    );
    expect(score.answered).toBe(0);
    expect(scoreQuiz(prompts, ['a-a', 'b-a', 'c-a'], lookup).correct).toBe(3);
  });
});

describe('walking through a session', () => {
  const pool = [sample('a'), sample('b')];
  const prompts = pool.map((question) => ({ id: question.id, choices: question.choices }));

  it('points at the first unanswered question, and at nothing once they are all answered', () => {
    expect(currentPrompt({ scope: 'all', prompts, answers: [], revealed: false })?.id).toBe('a');
    expect(currentPrompt({ scope: 'all', prompts, answers: ['a-a'], revealed: false })?.id).toBe('b');
    expect(currentPrompt({ scope: 'all', prompts, answers: ['a-a', 'b-a'], revealed: false })).toBeNull();
  });

  it('is complete when every question has an answer', () => {
    expect(isSessionComplete({ scope: 'all', prompts, answers: ['a-a'], revealed: true })).toBe(false);
    expect(isSessionComplete({ scope: 'all', prompts, answers: ['a-a', null], revealed: true })).toBe(true);
  });
});
