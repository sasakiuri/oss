import {
  MASTERED_BOX,
  TRUE_FALSE,
  type LicenceType,
  type QuestionProgress,
  type StudyArea,
  type StudyExam,
  type StudyQuestion,
  type StudySession,
} from './schemas/license-exam';
import { addDays, seededRandom, type DateKey } from './study-log';

export type {
  CourseArea,
  HuntingArea,
  LicenceType,
  QuestionProgress,
  StudyArea,
  StudyExam,
  StudyMode,
  StudyQuestion,
  StudySession,
  StudySource,
  StudySourceKey,
} from './schemas/license-exam';
export { TRUE_FALSE } from './schemas/license-exam';

/**
 * Drawing, marking and scheduling for the licence exam and firearms course practice. Like the law
 * quiz, this works on whatever pool it is handed and never imports the questions themselves.
 */

/**
 * The shape of a mock exam: how many questions from each area, how long, and how many must be
 * right. Every figure is one a public body has published; the screen names where each one is from.
 */
export interface MockBlueprint {
  exam: StudyExam;
  partial: boolean;
  /** Questions per area, in the order they are asked. */
  counts: Partial<Record<StudyArea, number>>;
  minutes: number;
  /** Right answers needed to pass. */
  passMark: number;
}

const total = (counts: Partial<Record<StudyArea, number>>) =>
  Object.values(counts).reduce((sum, count) => sum + (count ?? 0), 0);

/** Seventy per cent or more, as 規則第54条 sets it, in whole questions. */
const seventyPercent = (counts: Partial<Record<StudyArea, number>>) => Math.ceil(total(counts) * 0.7);

const huntingCounts = { law: 13, gear: 6, wildlife: 9, management: 2 } as const;
const partialCounts = { gear: 10 } as const;
const courseCounts = {
  responsibility: 1,
  prohibition: 1,
  permit: 5,
  renewal: 2,
  expiry: 2,
  revocation: 1,
  duties: 10,
  powderAndHunting: 3,
  mindset: 2,
  gunTypes: 1,
  mechanism: 3,
  power: 3,
  handling: 10,
  beforeUse: 2,
  storage: 2,
  cartridges: 2,
} as const;

export const MOCK_BLUEPRINTS = {
  // 三肢択一 30 問・90 分、法令 13・猟具 6・鳥獣 9・保護管理 2（高知県の案内）、70% 以上（規則第54条）
  hunting: {
    exam: 'hunting',
    partial: false,
    counts: huntingCounts,
    minutes: 90,
    passMark: seventyPercent(huntingCounts),
  },
  // 一部免除者は猟具の 10 問・30 分（東京都の案内）
  huntingPartial: {
    exam: 'hunting',
    partial: true,
    counts: partialCounts,
    minutes: 30,
    passMark: seventyPercent(partialCounts),
  },
  // 正誤式 50 問・60 分・45 点以上、配点は出題基準の別添1（警察庁通達）
  course: { exam: 'course', partial: false, counts: courseCounts, minutes: 60, passMark: 45 },
} as const satisfies Record<string, MockBlueprint>;

export function mockBlueprint(exam: StudyExam, partial: boolean): MockBlueprint {
  if (exam === 'course') return MOCK_BLUEPRINTS.course;
  return partial ? MOCK_BLUEPRINTS.huntingPartial : MOCK_BLUEPRINTS.hunting;
}

export function mockQuestionCount(blueprint: MockBlueprint): number {
  return total(blueprint.counts);
}

// The shuffle takes its random source as an argument, so a test can fix the order and check it.
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
 * The questions a reader preparing for `exam` with `licence` is asked. Gear is the one subject that
 * differs by licence; everything else in the hunting test is common to all four.
 */
export function questionsFor(pool: readonly StudyQuestion[], exam: StudyExam, licence: LicenceType): StudyQuestion[] {
  return pool.filter(
    (question) => question.exam === exam && (question.licences === undefined || question.licences.includes(licence)),
  );
}

/** How many choices each test offers: three-way choice, or right and wrong. */
export const choiceCount = (exam: StudyExam) => (exam === 'hunting' ? 3 : TRUE_FALSE.length);

/**
 * The choices as they will be shown. A true-or-false item always reads 正しい then 誤り. A question
 * written with more wrong choices than the test offers (the law quiz has four) keeps the answer
 * and as many wrong choices as fit, picked at random, so the same question is not always the same
 * three lines.
 */
export function promptFor(question: StudyQuestion, random: () => number): { id: string; choices: string[] } {
  if (question.exam === 'course') return { id: question.id, choices: [...TRUE_FALSE] };
  const wrong = shuffleWith(
    question.choices.filter((choice) => choice !== question.answer),
    random,
  ).slice(0, choiceCount(question.exam) - 1);
  return { id: question.id, choices: shuffleWith([question.answer, ...wrong], random) };
}

/** A practice draw: up to `count` questions, no question twice. */
export function drawPrompts(pool: readonly StudyQuestion[], count: number, random: () => number = Math.random) {
  return shuffleWith(pool, random)
    .slice(0, Math.max(0, Math.min(Math.floor(count), pool.length)))
    .map((question) => promptFor(question, random));
}

/**
 * A mock exam drawn to the blueprint, area by area. Null when an area holds fewer questions than
 * the blueprint asks for: a short mock would not be the exam it says it is.
 */
export function drawMock(
  pool: readonly StudyQuestion[],
  blueprint: MockBlueprint,
  random: () => number = Math.random,
): { id: string; choices: string[] }[] | null {
  const prompts: { id: string; choices: string[] }[] = [];
  for (const [area, count] of Object.entries(blueprint.counts) as [StudyArea, number][]) {
    const inArea = pool.filter((question) => question.area === area);
    if (inArea.length < count) return null;
    prompts.push(
      ...shuffleWith(inArea, random)
        .slice(0, count)
        .map((question) => promptFor(question, random)),
    );
  }
  return prompts;
}

/** The size of the daily test. */
export const DAILY_COUNT = 10;

/**
 * Today's questions: the same set for the whole day, drawn from a generator seeded with the day,
 * the test and the licence, so a reload or a second visit is asked the same ten.
 */
export function drawDaily(
  pool: readonly StudyQuestion[],
  today: DateKey,
  exam: StudyExam,
  licence: LicenceType,
): { id: string; choices: string[] }[] {
  // The course test is the same whatever hunting licence is chosen, so the licence only seeds the
  // hunting test's set.
  const seed = exam === 'hunting' ? `${today}:${exam}:${licence}` : `${today}:${exam}`;
  return drawPrompts(pool, DAILY_COUNT, seededRandom(seed));
}

/** Days until a question comes back, by the box it has reached. */
export const REVIEW_INTERVALS = [0, 1, 3] as const;

/**
 * The spaced repetition step (a Leitner box). A wrong or skipped answer sends the question back to
 * box 0, due at once. A right answer moves it up a box and further away: tomorrow, then in three
 * days, and the third right answer in a row marks it learnt.
 */
export function nextProgress(
  previous: QuestionProgress | undefined,
  correct: boolean,
  today: DateKey,
): QuestionProgress {
  const box = correct ? Math.min((previous?.box ?? 0) + 1, MASTERED_BOX) : 0;
  const interval = REVIEW_INTERVALS[box as 0 | 1 | 2] ?? 0;
  return {
    box,
    due: addDays(today, interval),
    seen: (previous?.seen ?? 0) + 1,
    correct: (previous?.correct ?? 0) + (correct ? 1 : 0),
  };
}

export const isMastered = (progress: QuestionProgress | undefined) => progress?.box === MASTERED_BOX;

/** The questions due for review today: answered before, not yet learnt, and due. */
export function dueQuestions(
  pool: readonly StudyQuestion[],
  progress: Readonly<Record<string, QuestionProgress>>,
  today: DateKey,
): StudyQuestion[] {
  return pool.filter((question) => {
    const entry = progress[question.id];
    return entry !== undefined && entry.box < MASTERED_BOX && entry.due <= today;
  });
}

export interface AreaTally {
  total: number;
  correct: number;
}

export interface ProgressSummary {
  unseen: number;
  learning: number;
  mastered: number;
  /** Every answer given so far, by area. */
  byArea: Partial<Record<StudyArea, AreaTally>>;
}

/** Where the reader stands on a pool: what is new, in progress and learnt, and the rate per area. */
export function summarizeProgress(
  pool: readonly StudyQuestion[],
  progress: Readonly<Record<string, QuestionProgress>>,
): ProgressSummary {
  const summary: ProgressSummary = { unseen: 0, learning: 0, mastered: 0, byArea: {} };
  for (const question of pool) {
    const entry = progress[question.id];
    if (entry === undefined) summary.unseen += 1;
    else if (isMastered(entry)) summary.mastered += 1;
    else summary.learning += 1;
    if (entry === undefined) continue;
    const tally = summary.byArea[question.area] ?? { total: 0, correct: 0 };
    summary.byArea[question.area] = { total: tally.total + entry.seen, correct: tally.correct + entry.correct };
  }
  return summary;
}

export interface SessionScore {
  total: number;
  correct: number;
  wrong: number;
  unanswered: number;
  byArea: Partial<Record<StudyArea, AreaTally>>;
  /** The ids answered wrongly or not at all. */
  missed: string[];
}

/**
 * Score a session. Every prompt counts, answered or not: in a mock an unanswered question is a
 * mark lost, and a practice session is only scored once it is over.
 *
 * A prompt whose question has since gone from the pool is dropped rather than counted wrong.
 */
export function scoreSession(
  session: Pick<StudySession, 'prompts' | 'answers'>,
  lookup: (id: string) => StudyQuestion | undefined,
): SessionScore {
  const score: SessionScore = { total: 0, correct: 0, wrong: 0, unanswered: 0, byArea: {}, missed: [] };
  session.prompts.forEach((prompt, index) => {
    const question = lookup(prompt.id);
    if (question === undefined) return;
    const answer = session.answers[index] ?? null;
    const right = answer === question.answer;
    score.total += 1;
    if (right) score.correct += 1;
    else if (answer === null) score.unanswered += 1;
    else score.wrong += 1;
    if (!right) score.missed.push(question.id);
    const tally = score.byArea[question.area] ?? { total: 0, correct: 0 };
    score.byArea[question.area] = { total: tally.total + 1, correct: tally.correct + (right ? 1 : 0) };
  });
  return score;
}

/**
 * Seconds left in a timed session at `now`, never below zero and never above the time allowed (a
 * `now` read before the start does not add time); null for an untimed one.
 */
export function remainingSeconds(session: Pick<StudySession, 'startedAt' | 'limitMinutes'>, now: number) {
  if (session.startedAt === null || session.limitMinutes === null) return null;
  const limit = session.limitMinutes * 60;
  return Math.min(limit, Math.max(0, Math.ceil((session.startedAt + limit * 1000 - now) / 1000)));
}
