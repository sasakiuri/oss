import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SessionResults } from '@/app/(standalone)/labs/game-species-test/session-results';
import { quizList } from '@/features/game-species/quiz-data';

const [knew, missed, ungraded] = quizList.slice(0, 3);
if (!knew || !missed || !ungraded) throw new Error('quizList needs at least three entries for this test.');
const order = [knew.image, missed.image, ungraded.image];
const answers = { [knew.image]: true, [missed.image]: false };

const draw = (onReview = vi.fn()) => {
  render(<SessionResults order={order} answers={answers} language="ja" onReview={onReview} />);
  return onReview;
};
const rows = () => screen.getAllByRole('checkbox');
const named = (name: string) => screen.getByRole('checkbox', { name: new RegExp(name) });

describe('choosing what to review after a session', () => {
  it('opens with everything but what the reader said they knew', () => {
    draw();
    // Reviewing what you already know is the one thing nobody asked for, so it starts unticked.
    expect(named(knew.answer)).not.toBeChecked();
    expect(named(missed.answer)).toBeChecked();
    expect(named(ungraded.answer)).toBeChecked();
    expect(screen.getByRole('button', { name: '選んだ 2 問を復習' })).toBeEnabled();
  });

  it('shows only what each filter is named after', () => {
    draw();
    expect(rows()).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: '要復習' }));
    expect(rows()).toHaveLength(1);
    expect(named(missed.answer)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '未採点' }));
    expect(rows()).toHaveLength(1);
    expect(named(ungraded.answer)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'すべて' }));
    expect(rows()).toHaveLength(3);
  });

  it('adds what is on screen to the selection instead of replacing it', () => {
    draw();
    // One selected and about to be hidden, one on screen and unselected: the two have to end up
    // selected together, which replacing the selection with what is shown would not do.
    fireEvent.click(named(ungraded.answer));
    expect(screen.getByRole('button', { name: '選んだ 1 問を復習' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '未採点' }));
    expect(rows()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '表示中を選択' }));
    fireEvent.click(screen.getByRole('button', { name: 'すべて' }));
    expect(named(missed.answer)).toBeChecked();
    expect(named(ungraded.answer)).toBeChecked();
    // A filter narrows what can be added, not what the reader already has.
    expect(named(knew.answer)).not.toBeChecked();
  });

  it('keeps a selection that the filter has hidden', () => {
    const onReview = draw();
    fireEvent.click(screen.getByRole('button', { name: '未採点' }));
    // The missed one is selected but not on screen, and it still goes to the review.
    expect(rows()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '選んだ 2 問を復習' }));
    expect(onReview).toHaveBeenCalledWith([missed.image, ungraded.image]);
  });

  it('clears the whole selection, not just what is shown', () => {
    draw();
    fireEvent.click(screen.getByRole('button', { name: '未採点' }));
    fireEvent.click(screen.getByRole('button', { name: '選択を解除' }));
    fireEvent.click(screen.getByRole('button', { name: 'すべて' }));
    for (const row of rows()) expect(row).not.toBeChecked();
    // Nothing is left to clear or to review, and both controls say so.
    expect(screen.getByRole('button', { name: '選択を解除' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '選んだ 0 問を復習' })).toBeDisabled();
  });

  it('marks which filter is in force', () => {
    draw();
    const filters = within(screen.getByRole('group', { name: '回答の絞り込み' })).getAllByRole('button');
    expect(filters.map((button) => button.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    fireEvent.click(screen.getByRole('button', { name: '要復習' }));
    expect(filters.map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
  });

  it('says so rather than showing an empty list when a filter matches nothing', () => {
    render(<SessionResults order={[knew.image]} answers={{ [knew.image]: true }} language="ja" onReview={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '要復習' }));
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getByText('該当する鳥獣はありません。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '表示中を選択' })).toBeDisabled();
  });

  it('marks each answer with how it was graded', () => {
    draw();
    const label = (name: string) => named(name).closest('label')!;
    expect(within(label(knew.answer)).getByText('わかった')).toBeInTheDocument();
    expect(within(label(missed.answer)).getByText('要復習')).toBeInTheDocument();
    expect(within(label(ungraded.answer)).getByText('未採点')).toBeInTheDocument();
  });
});
