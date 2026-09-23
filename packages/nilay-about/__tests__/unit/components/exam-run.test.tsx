import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExamSession } from '@/app/(standalone)/labs/game-species-test/_store';
import { ExamRun } from '@/app/(standalone)/labs/game-species-test/exam-run';
import { quizList } from '@/features/game-species/quiz-data';

const question = (offset: number) => {
  const quiz = quizList[offset];
  if (!quiz) throw new Error(`No quiz at offset ${offset}.`);
  return {
    image: quiz.image,
    answer: quiz.answer,
    // Four distinct names, as a real question has: a repeat would collide on the key the choices
    // are listed by, which the count below would catch.
    choices: [
      quiz.answer,
      ...quizList
        .filter((item) => item.answer !== quiz.answer)
        .slice(0, 3)
        .map((item) => item.answer),
    ],
  };
};

// One set of questions for the whole file, so a re-render only changes what it means to change.
const questions = [question(0), question(1)];

const session = (timeLimit: 5 | 10 | null, answers: (string | null)[] = []): ExamSession => ({
  category: 'all',
  questionCount: 2,
  timeLimit,
  questions,
  answers,
});

describe('the countdown on a timed question', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reports whole seconds only, however often it looks at the clock', () => {
    const onTick = vi.fn();
    render(
      <ExamRun exam={session(5)} language="ja" remaining={5} onTick={onTick} onAnswer={vi.fn()} onQuit={vi.fn()} />,
    );
    // The interval runs five times a second; re-rendering the page that often would be felt.
    act(() => void vi.advanceTimersByTime(1000));
    expect(onTick.mock.calls.map(([, left]) => left)).toEqual([5, 4]);
    act(() => void vi.advanceTimersByTime(1000));
    expect(onTick.mock.calls.map(([, left]) => left)).toEqual([5, 4, 3]);
  });

  it('counts running out of time as no answer and stops looking', () => {
    const onAnswer = vi.fn();
    const onTick = vi.fn();
    render(
      <ExamRun exam={session(5)} language="ja" remaining={5} onTick={onTick} onAnswer={onAnswer} onQuit={vi.fn()} />,
    );
    act(() => void vi.advanceTimersByTime(5000));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith(null);
    const ticks = onTick.mock.calls.length;
    // The interval is cleared on expiry, so nothing keeps reporting into a question that is over.
    act(() => void vi.advanceTimersByTime(5000));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onTick.mock.calls).toHaveLength(ticks);
  });

  it('starts the deadline again for the next question rather than carrying it over', () => {
    const onAnswer = vi.fn();
    const onTick = vi.fn();
    const { rerender } = render(
      <ExamRun exam={session(5)} language="ja" remaining={5} onTick={onTick} onAnswer={onAnswer} onQuit={vi.fn()} />,
    );
    act(() => void vi.advanceTimersByTime(4000));
    rerender(
      <ExamRun
        exam={session(5, ['答え'])}
        language="ja"
        remaining={5}
        onTick={onTick}
        onAnswer={onAnswer}
        onQuit={vi.fn()}
      />,
    );
    onTick.mockClear();
    act(() => void vi.advanceTimersByTime(4000));
    // Eight seconds in: a deadline carried over from the first question ran out three seconds ago.
    expect(onAnswer).not.toHaveBeenCalled();
    expect(onTick.mock.calls.map(([index]) => index)).toEqual([1, 1, 1, 1, 1]);
  });

  it('stops looking at the clock once the question is off the page', () => {
    const onTick = vi.fn();
    const onAnswer = vi.fn();
    const { unmount } = render(
      <ExamRun exam={session(5)} language="ja" remaining={5} onTick={onTick} onAnswer={onAnswer} onQuit={vi.fn()} />,
    );
    act(() => void vi.advanceTimersByTime(1000));
    expect(onTick).toHaveBeenCalled();
    unmount();
    onTick.mockClear();
    // Leaving the quiz has to end the countdown, or it would answer a question nobody is looking at.
    act(() => void vi.advanceTimersByTime(10000));
    expect(onTick).not.toHaveBeenCalled();
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('keeps the deadline through the re-renders its own ticks cause', () => {
    // The page above stores the seconds left, so every tick re-renders this component. The deadline
    // has to survive that: an effect that restarted on each render would never reach zero.
    const exam = session(5);
    const onAnswer = vi.fn();
    let left: number | null = 5;
    const onTick = vi.fn((_index: number, value: number) => void (left = value));
    const draw = () => (
      <ExamRun exam={exam} language="ja" remaining={left} onTick={onTick} onAnswer={onAnswer} onQuit={vi.fn()} />
    );
    const { rerender } = render(draw());
    for (let second = 0; second < 5; second++) {
      act(() => void vi.advanceTimersByTime(1000));
      rerender(draw());
    }
    expect(onAnswer).toHaveBeenCalledWith(null);
  });

  it('leaves the question alone when no limit was chosen', () => {
    const onAnswer = vi.fn();
    const onTick = vi.fn();
    render(
      <ExamRun
        exam={session(null)}
        language="ja"
        remaining={null}
        onTick={onTick}
        onAnswer={onAnswer}
        onQuit={vi.fn()}
      />,
    );
    act(() => void vi.advanceTimersByTime(60000));
    expect(onTick).not.toHaveBeenCalled();
    expect(onAnswer).not.toHaveBeenCalled();
    // No clock on screen either: a countdown with nothing to count down to would read as
    // "null 秒" and draw a bar of NaN.
    expect(screen.queryByText('残り時間')).toBeNull();
    expect(within(screen.getByRole('group', { name: '選択肢' })).getAllByRole('button')).toHaveLength(4);
  });

  it('shows the whole limit until the first tick, then what is left', () => {
    const exam = session(5);
    const draw = (remaining: number | null) => (
      <ExamRun exam={exam} language="ja" remaining={remaining} onTick={vi.fn()} onAnswer={vi.fn()} onQuit={vi.fn()} />
    );
    const { rerender } = render(draw(null));
    // Nothing has been counted yet, so the limit itself is what the reader sees.
    expect(screen.getByText('残り時間')).toBeInTheDocument();
    expect(screen.getByText('5 秒')).toBeInTheDocument();
    rerender(draw(3));
    expect(screen.getByText('3 秒')).toBeInTheDocument();
  });
});

describe('leaving a running quiz', () => {
  it('offers a way out on the question itself, not only in the settings below it', () => {
    const onQuit = vi.fn();
    const onAnswer = vi.fn();
    render(
      <ExamRun
        exam={session(null)}
        language="ja"
        remaining={null}
        onTick={vi.fn()}
        onAnswer={onAnswer}
        onQuit={onQuit}
      />,
    );
    act(() => screen.getByRole('button', { name: 'やめる' }).click());
    expect(onQuit).toHaveBeenCalledTimes(1);
    // Quitting is not an answer: the caller decides whether the answers so far are dropped.
    expect(onAnswer).not.toHaveBeenCalled();
  });
});
