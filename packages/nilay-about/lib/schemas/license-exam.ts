import { z } from 'zod';

import { dateKeySchema } from './study-log';

/**
 * The two written tests a new hunter with a gun sits in Japan.
 *
 * `hunting` is the knowledge test of the hunting licence exam (狩猟免許試験の知識試験), set by each
 * prefecture under article 54 of the enforcement regulation. `course` is the test at the end of the
 * beginners' firearms course (猟銃等講習会の考査), run by the police under a National Police Agency
 * circular. The two are kept apart because they are different exams with different pass marks.
 */
export const studyExams = ['hunting', 'course'] as const;
export const studyExamSchema = z.enum(studyExams);
export type StudyExam = z.infer<typeof studyExamSchema>;

/** The four hunting licences (法第39条第2項). Only the gear questions differ between them. */
export const licenceTypes = ['net', 'trap', 'gun1', 'gun2'] as const;
export const licenceTypeSchema = z.enum(licenceTypes);
export type LicenceType = z.infer<typeof licenceTypeSchema>;

/** The four subjects of the knowledge test (規則第54条). */
export const huntingAreas = ['law', 'gear', 'wildlife', 'management'] as const;

/**
 * The rows of the course test's syllabus for shotguns, rifles and air guns (別添1 出題基準).
 * The first eight are 第1 (the law), the rest 第2 (use, storage and handling).
 */
export const courseAreas = [
  'responsibility',
  'prohibition',
  'permit',
  'renewal',
  'expiry',
  'revocation',
  'duties',
  'powderAndHunting',
  'mindset',
  'gunTypes',
  'mechanism',
  'power',
  'handling',
  'beforeUse',
  'storage',
  'cartridges',
] as const;

export const studyAreaSchema = z.enum([...huntingAreas, ...courseAreas]);
export type StudyArea = z.infer<typeof studyAreaSchema>;
export type HuntingArea = (typeof huntingAreas)[number];
export type CourseArea = (typeof courseAreas)[number];

/**
 * The documents a question can rest on. `act` and `regulation` are the same statutes the law quiz
 * cites; the others are published by a ministry, the police or a prefecture.
 */
export const studySourceKeySchema = z.enum([
  'act',
  'regulation',
  'npaCourse',
  'moeEmergency',
  'moeCapture',
  'hokkaidoDeer',
  'kochiExam',
  'tokyoExam',
]);
export type StudySourceKey = z.infer<typeof studySourceKeySchema>;

export const studySourceSchema = z.object({
  doc: studySourceKeySchema,
  // The article, the item of an appendix or the page the answer rests on.
  locator: z.string().min(1),
});
export type StudySource = z.infer<typeof studySourceSchema>;

/**
 * A question of either test. The hunting test is three-way multiple choice and the course test is
 * true or false (正誤式), so a true-or-false item is a question whose two choices are the words for
 * right and wrong.
 */
export const studyQuestionSchema = z
  .object({
    id: z.string().min(1),
    exam: studyExamSchema,
    area: studyAreaSchema,
    // Gear questions name the licences they belong to; every other question is common to all four.
    licences: z.array(licenceTypeSchema).min(1).optional(),
    question: z.string().min(1),
    choices: z.array(z.string().min(1)).min(2),
    answer: z.string().min(1),
    explanation: z.string().min(1),
    sources: z.array(studySourceSchema).min(1),
  })
  .refine((question) => question.choices.filter((choice) => choice === question.answer).length === 1, {
    message: 'The answer has to appear among the choices exactly once',
  })
  .refine((question) => new Set(question.choices).size === question.choices.length, {
    message: 'The choices have to differ from one another',
  });
export type StudyQuestion = z.infer<typeof studyQuestionSchema>;

/** The words a true-or-false item offers, in the order they are always shown. */
export const TRUE_FALSE = ['正しい', '誤り'] as const;

/**
 * How a question sits in the reader's spaced repetition.
 *
 * `box` 0 is a question that was missed and is due again at once; each right answer moves it up
 * one box and further out in time, and a question that reaches MASTERED_BOX is learnt and asked no
 * more in review. `seen` and `correct` count every answer, for the rate shown per area.
 */
export const MASTERED_BOX = 3;
export const questionProgressSchema = z.object({
  box: z.number().int().min(0).max(MASTERED_BOX),
  due: dateKeySchema,
  seen: z.number().int().positive(),
  correct: z.number().int().nonnegative(),
});
export type QuestionProgress = z.infer<typeof questionProgressSchema>;

export const studyModes = ['practice', 'daily', 'review', 'mock'] as const;
export const studyModeSchema = z.enum(studyModes);
export type StudyMode = z.infer<typeof studyModeSchema>;

/**
 * A session as it is stored: the questions by id and the choices as they were shown, never the
 * text, so an edited question is found out on reload instead of being asked in its old form.
 */
export const studySessionSchema = z
  .object({
    mode: studyModeSchema,
    exam: studyExamSchema,
    licence: licenceTypeSchema,
    // The mock for someone who already holds another licence: gear only (規則第56条).
    partial: z.boolean(),
    prompts: z.array(z.object({ id: z.string().min(1), choices: z.array(z.string().min(1)).min(2).readonly() })).min(1),
    // One slot per prompt; null until answered (or left unanswered).
    answers: z.array(z.string().nullable()),
    current: z.number().int().nonnegative(),
    // Practice: the answer to the current question is on screen. A mock never reveals until it ends.
    revealed: z.boolean(),
    flagged: z.array(z.string()),
    // Mock: when it started (ms since the epoch) and how long it lasts.
    startedAt: z.number().nullable(),
    limitMinutes: z.number().int().positive().nullable(),
    finished: z.boolean(),
  })
  .refine((session) => session.answers.length === session.prompts.length, {
    message: 'Every question has one answer slot',
  })
  .refine((session) => session.current <= session.prompts.length, { message: 'The current question is out of range' })
  .refine((session) => new Set(session.prompts.map((prompt) => prompt.id)).size === session.prompts.length, {
    message: 'A session cannot ask the same question twice',
  });
export type StudySession = z.infer<typeof studySessionSchema>;
