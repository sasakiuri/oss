import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ConditionPair } from '@/components/labs';

const renderPair = (secondNeedsAttention = false) =>
  render(
    <ConditionPair
      legend="表示する条件"
      attentionLabel="確認が必要な入力があります"
      first={{ id: 'condition-a', label: '条件 A', content: <p>A の入力</p> }}
      second={{ id: 'condition-b', label: '条件 B', content: <p>B の入力</p>, needsAttention: secondNeedsAttention }}
    />,
  );

describe('ConditionPair', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('shows the first condition and keeps the other for the wide layout only', () => {
    renderPair();
    expect(screen.getByRole('radio', { name: '条件 A' })).toBeChecked();
    expect(screen.getByText('A の入力').parentElement).not.toHaveClass('hidden');
    expect(screen.getByText('B の入力').parentElement).toHaveClass('hidden', 'lg:block');
    fireEvent.click(screen.getByRole('radio', { name: '条件 B' }));
    expect(screen.getByText('A の入力').parentElement).toHaveClass('hidden', 'lg:block');
    expect(screen.getByText('B の入力').parentElement).not.toHaveClass('hidden');
  });

  it('says on the switch when the side not shown has something to check', () => {
    renderPair(true);
    expect(screen.getByRole('radio', { name: /^条件 B\s*（確認が必要な入力があります）$/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '条件 A' })).toBeInTheDocument();
  });

  it('prints both conditions, whichever is shown', () => {
    renderPair();
    expect(screen.getByText('B の入力').parentElement).toHaveClass('print:!block');
  });

  it('brings a condition forward again when the same link is followed twice', () => {
    window.history.replaceState(null, '', '/#condition-b');
    renderPair();
    fireEvent.click(screen.getByRole('radio', { name: '条件 A' }));
    const link = document.createElement('a');
    link.href = '#condition-b';
    document.body.append(link);
    fireEvent.click(link);
    expect(screen.getByRole('radio', { name: '条件 B' })).toBeChecked();
    link.remove();
  });

  it('brings forward the condition a link points at', () => {
    window.history.replaceState(null, '', '/#condition-b');
    renderPair();
    expect(screen.getByRole('radio', { name: '条件 B' })).toBeChecked();
  });
});
