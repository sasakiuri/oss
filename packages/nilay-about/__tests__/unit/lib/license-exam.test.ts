import { describe, expect, it } from 'vitest';

import { courseQuestions } from '@/app/(standalone)/labs/license-exam/course-questions';
import { knowledgeQuestions } from '@/app/(standalone)/labs/license-exam/knowledge-questions';
import { studyQuestions, studyQuestionsById } from '@/app/(standalone)/labs/license-exam/questions';
import { STUDY_SOURCES } from '@/app/(standalone)/labs/license-exam/sources';
import {
  drawDaily,
  drawMock,
  dueQuestions,
  MOCK_BLUEPRINTS,
  mockBlueprint,
  mockQuestionCount,
  nextProgress,
  promptFor,
  questionsFor,
  remainingSeconds,
  scoreSession,
  summarizeProgress,
  TRUE_FALSE,
  type StudyQuestion,
} from '@/lib/license-exam';
import { licenceTypes, studyQuestionSchema } from '@/lib/schemas/license-exam';

const sequence = (values: number[]) => {
  let index = 0;
  return () => values[index++ % values.length] ?? 0;
};

describe('the question data', () => {
  it('holds every question to the schema, with unique ids and a known source', () => {
    for (const question of studyQuestions) {
      expect({ id: question.id, ok: studyQuestionSchema.safeParse(question).success }).toEqual({
        id: question.id,
        ok: true,
      });
      for (const source of question.sources) expect(Object.keys(STUDY_SOURCES)).toContain(source.doc);
    }
    expect(studyQuestionsById.size).toBe(studyQuestions.length);
  });

  it('writes the knowledge questions with three choices and the course items as true or false', () => {
    for (const question of knowledgeQuestions) expect(question.choices).toHaveLength(3);
    for (const question of courseQuestions) {
      expect(question.choices).toEqual([...TRUE_FALSE]);
      expect(question.sources.every((source) => source.doc === 'npaCourse')).toBe(true);
    }
    // Both kinds of course item, so the answer is not always the same word.
    expect(courseQuestions.some((question) => question.answer === TRUE_FALSE[0])).toBe(true);
    expect(courseQuestions.some((question) => question.answer === TRUE_FALSE[1])).toBe(true);
  });

  it('has enough questions for every mock exam and every licence', () => {
    for (const licence of licenceTypes) {
      const hunting = questionsFor(studyQuestions, 'hunting', licence);
      expect({ licence, full: drawMock(hunting, MOCK_BLUEPRINTS.hunting) !== null }).toEqual({ licence, full: true });
      expect({ licence, partial: drawMock(hunting, MOCK_BLUEPRINTS.huntingPartial) !== null }).toEqual({
        licence,
        partial: true,
      });
    }
    expect(drawMock(questionsFor(studyQuestions, 'course', 'gun1'), MOCK_BLUEPRINTS.course)).not.toBeNull();
  });

  it('keeps gear questions to the licences they name', () => {
    const trap = questionsFor(studyQuestions, 'hunting', 'trap').map((question) => question.id);
    expect(trap).toContain('gear-trap-01');
    expect(trap).not.toContain('gear-gun-04');
    expect(trap).not.toContain('gear-net-01');
    expect(questionsFor(studyQuestions, 'hunting', 'gun2').map((question) => question.id)).not.toContain('gear-gun-04');
  });
});

describe('the mock exams', () => {
  it('follows the published size, time and pass mark', () => {
    expect(mockQuestionCount(MOCK_BLUEPRINTS.hunting)).toBe(30);
    expect(MOCK_BLUEPRINTS.hunting).toMatchObject({ minutes: 90, passMark: 21 });
    expect(mockQuestionCount(MOCK_BLUEPRINTS.huntingPartial)).toBe(10);
    expect(MOCK_BLUEPRINTS.huntingPartial).toMatchObject({ minutes: 30, passMark: 7 });
    expect(mockQuestionCount(MOCK_BLUEPRINTS.course)).toBe(50);
    expect(MOCK_BLUEPRINTS.course).toMatchObject({ minutes: 60, passMark: 45 });
    expect(mockBlueprint('course', true)).toBe(MOCK_BLUEPRINTS.course);
  });

  it('draws each area to its count, without repeats', () => {
    const pool = questionsFor(studyQuestions, 'hunting', 'gun1');
    const prompts = drawMock(pool, MOCK_BLUEPRINTS.hunting, sequence([0.3, 0.7, 0.1]));
    expect(prompts).not.toBeNull();
    const areas = prompts!.map((prompt) => studyQuestionsById.get(prompt.id)?.area);
    expect(areas.filter((area) => area === 'law')).toHaveLength(13);
    expect(areas.filter((area) => area === 'gear')).toHaveLength(6);
    expect(areas.filter((area) => area === 'wildlife')).toHaveLength(9);
    expect(areas.filter((area) => area === 'management')).toHaveLength(2);
    expect(new Set(prompts!.map((prompt) => prompt.id)).size).toBe(30);
  });

  it('refuses a mock that the pool cannot fill', () => {
    expect(drawMock(knowledgeQuestions.slice(0, 3), MOCK_BLUEPRINTS.hunting)).toBeNull();
  });

  it('counts down from the stored start', () => {
    const session = { startedAt: 1_000_000, limitMinutes: 60 };
    expect(remainingSeconds(session, 1_000_000)).toBe(3600);
    expect(remainingSeconds(session, 1_000_000 + 3_599_500)).toBe(1);
    expect(remainingSeconds(session, 1_000_000 + 4_000_000)).toBe(0);
    expect(remainingSeconds({ startedAt: null, limitMinutes: null }, 0)).toBeNull();
    // A time read before the start gives no more than the time allowed.
    expect(remainingSeconds(session, 1_000_000 - 5_000)).toBe(3600);
  });
});

describe('prompts and scoring', () => {
  const law = studyQuestions.find((question) => question.area === 'law') as StudyQuestion;

  it('cuts a four-choice law question to three, always keeping the answer', () => {
    expect(law.choices).toHaveLength(4);
    for (let seed = 0; seed < 5; seed++) {
      const prompt = promptFor(law, sequence([seed / 5, 0.9, 0.2]));
      expect(prompt.choices).toHaveLength(3);
      expect(prompt.choices).toContain(law.answer);
    }
  });

  it('shows true-or-false items in a fixed order', () => {
    const item = courseQuestions[0] as StudyQuestion;
    expect(promptFor(item, () => 0.99).choices).toEqual([...TRUE_FALSE]);
  });

  it('scores by area and lists what was missed', () => {
    const [a, b] = courseQuestions as [StudyQuestion, StudyQuestion];
    const score = scoreSession(
      {
        prompts: [
          { id: a.id, choices: [...TRUE_FALSE] },
          { id: b.id, choices: [...TRUE_FALSE] },
          { id: 'gone', choices: [...TRUE_FALSE] },
        ],
        answers: [a.answer, null, 'x'],
      },
      (id) => studyQuestionsById.get(id),
    );
    expect(score).toMatchObject({ total: 2, correct: 1, wrong: 0, unanswered: 1, missed: [b.id] });
  });

  it('gives the same daily set all day, and another the next day', () => {
    const pool = questionsFor(studyQuestions, 'hunting', 'trap');
    const today = drawDaily(pool, '2026-09-24', 'hunting', 'trap');
    expect(today).toHaveLength(10);
    expect(drawDaily(pool, '2026-09-24', 'hunting', 'trap')).toEqual(today);
    expect(drawDaily(pool, '2026-09-25', 'hunting', 'trap')).not.toEqual(today);
  });
});

describe('spaced repetition', () => {
  it('moves a question up a box on each right answer and learns it on the third', () => {
    const first = nextProgress(undefined, true, '2026-09-24');
    expect(first).toEqual({ box: 1, due: '2026-09-25', seen: 1, correct: 1 });
    const second = nextProgress(first, true, '2026-09-25');
    expect(second).toMatchObject({ box: 2, due: '2026-09-28' });
    const third = nextProgress(second, true, '2026-09-28');
    expect(third.box).toBe(3);
  });

  it('sends a missed question back to the start, due at once', () => {
    const missed = nextProgress({ box: 2, due: '2026-09-28', seen: 2, correct: 2 }, false, '2026-09-28');
    expect(missed).toEqual({ box: 0, due: '2026-09-28', seen: 3, correct: 2 });
  });

  it('asks in review only what is due and not yet learnt', () => {
    const pool = courseQuestions.slice(0, 4);
    const [a, b, c] = pool as [StudyQuestion, StudyQuestion, StudyQuestion];
    const progress = {
      [a.id]: { box: 0, due: '2026-09-24', seen: 1, correct: 0 },
      [b.id]: { box: 1, due: '2026-09-25', seen: 1, correct: 1 },
      [c.id]: { box: 3, due: '2026-09-20', seen: 3, correct: 3 },
    };
    expect(dueQuestions(pool, progress, '2026-09-24').map((question) => question.id)).toEqual([a.id]);
    expect(dueQuestions(pool, progress, '2026-09-25').map((question) => question.id)).toEqual([a.id, b.id]);
    expect(summarizeProgress(pool, progress)).toMatchObject({ unseen: 1, learning: 2, mastered: 1 });
  });
});
