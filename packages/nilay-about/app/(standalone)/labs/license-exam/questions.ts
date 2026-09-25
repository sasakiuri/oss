import type { StudyQuestion } from '@/lib/license-exam';
import { lawQuizCategoryFamily } from '@/lib/schemas/law-quiz';

import { lawQuestions } from '../law-quiz/questions';

import { courseQuestions } from './course-questions';
import { knowledgeQuestions } from './knowledge-questions';

/**
 * The law part of the knowledge test is the law quiz's own questions on the Wildlife Protection and
 * Hunting Management Act and its regulation, used as written. The quiz offers four choices and the
 * exam three, so when one is asked here it keeps the answer and two of its three wrong choices.
 */
const lawPart: StudyQuestion[] = lawQuestions
  .filter((question) => lawQuizCategoryFamily[question.category] === 'wildlife')
  .map((question) => ({
    id: `law-${question.id}`,
    exam: 'hunting',
    area: 'law',
    question: question.question,
    choices: [...question.choices],
    answer: question.answer,
    explanation: question.explanation,
    sources: question.sources.map((source) => ({
      // The wildlife areas of the law quiz cite only these two, which a unit test holds it to.
      doc: source.law === 'act' ? 'act' : 'regulation',
      locator: source.article,
    })),
  }));

export const studyQuestions: readonly StudyQuestion[] = [...lawPart, ...knowledgeQuestions, ...courseQuestions];

export const studyQuestionsById: ReadonlyMap<string, StudyQuestion> = new Map(
  studyQuestions.map((question) => [question.id, question]),
);
