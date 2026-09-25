import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLicenseExamStore } from '@/app/(standalone)/labs/license-exam/_store';
import { LicenseExamClient } from '@/app/(standalone)/labs/license-exam/license-exam-client';
import { ShootDecisionClient } from '@/app/(standalone)/labs/shoot-decision/shoot-decision-client';
import { useWindPracticeStore } from '@/app/(standalone)/labs/wind-practice/_store';
import { WindPracticeClient } from '@/app/(standalone)/labs/wind-practice/wind-practice-client';
import { useStorageStatus } from '@/lib/browser-storage';
import { useLanguageStore, useStudyLogStore } from '@/store';

vi.mock('@/components/labs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/labs')>();
  const { createElement } = await import('react');
  return {
    ...actual,
    AppLayout: ({ header, children }: { header: ReactNode; children: ReactNode }) =>
      createElement('div', null, header, children),
    AppHeader: ({ title, actions }: { title: string; actions?: ReactNode }) =>
      createElement('header', null, title, actions),
    LanguageMenu: () => null,
  };
});

const loaded = () => waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
beforeEach(() => {
  useLicenseExamStore.setState(useLicenseExamStore.getInitialState(), true);
  useWindPracticeStore.setState(useWindPracticeStore.getInitialState(), true);
  useStudyLogStore.setState(useStudyLogStore.getInitialState(), true);
  window.localStorage.clear();
  useLanguageStore.setState({ language: 'ja' });
  useStorageStatus.setState({ available: true, discarded: [] });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe('study workflows', () => {
  it('reveals a practice answer once, advances, and preserves progress when quitting', async () => {
    render(<LicenseExamClient />);
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: '練習を開始' }));
    expect(screen.getByText('1 / 10')).toBeInTheDocument();
    const choices = within(screen.getByRole('group', { name: '選択肢' })).getAllByRole('button');
    fireEvent.click(choices[0]!);
    expect(screen.getByText(/^根拠:/)).toBeInTheDocument();
    const given = useLicenseExamStore.getState().session?.answers[0];
    fireEvent.click(choices[1]!);
    expect(useLicenseExamStore.getState().session?.answers[0]).toBe(given);
    fireEvent.click(screen.getByRole('button', { name: '次の問題へ' }));
    expect(screen.getByText('2 / 10')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'やめる' }));
    expect(useLicenseExamStore.getState().session).toBeNull();
    expect(Object.keys(useLicenseExamStore.getState().progress)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '学習の記録を消す' }));
    expect(useLicenseExamStore.getState().progress).toEqual({});
  });

  it('keeps mock answers unmarked until submission, supports flags, and reports unanswered questions', async () => {
    render(<LicenseExamClient />);
    await loaded();
    fireEvent.click(within(screen.getByRole('group', { name: '試験' })).getByLabelText('猟銃等講習会の考査'));
    fireEvent.click(screen.getByRole('button', { name: '模擬試験を開始' }));
    expect(screen.getByRole('timer')).toHaveTextContent('60:00');
    fireEvent.click(within(screen.getByRole('group', { name: '選択肢' })).getByRole('button', { name: '正しい' }));
    expect(screen.queryByText(/^根拠:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '後で見直す' }));
    expect(useLicenseExamStore.getState().session?.flagged).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    expect(screen.getByText(/2 \/ 50 問目/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '提出して採点する' }));
    expect(screen.getByRole('heading', { name: '模擬試験の結果' })).toBeInTheDocument();
    expect(screen.getByText(/合格基準（45 問以上の正解）/)).toBeInTheDocument();
    expect(useLicenseExamStore.getState().session?.finished).toBe(true);
    expect(Object.keys(useLicenseExamStore.getState().progress)).toHaveLength(50);
  });

  it('restores the same daily question and answer after remounting', async () => {
    const view = render(<LicenseExamClient />);
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: /今日のテスト/ }));
    const question = useLicenseExamStore.getState().session?.prompts[0]?.id;
    fireEvent.click(within(screen.getByRole('group', { name: '選択肢' })).getAllByRole('button')[0]!);
    const answer = useLicenseExamStore.getState().session?.answers[0];
    view.unmount();
    render(<LicenseExamClient />);
    await loaded();
    expect(useLicenseExamStore.getState().session).toMatchObject({ revealed: true, prompts: expect.any(Array) });
    expect(useLicenseExamStore.getState().session?.prompts[0]?.id).toBe(question);
    expect(useLicenseExamStore.getState().session?.answers[0]).toBe(answer);
    expect(screen.getByText(/^根拠:/)).toBeInTheDocument();
  });

  it('records wind-value answers separately from holds and clears the record on request', async () => {
    render(<WindPracticeClient />);
    await loaded();
    const question = screen.getByText(/時から吹く風。射線を横切る割合は何 % ですか。/).textContent!;
    const hour = Number(question.match(/^(\d+) 時/)![1]);
    const percentage = Math.round(Math.abs(Math.sin((hour * Math.PI) / 6)) * 100);
    fireEvent.change(screen.getByLabelText('答え（%）'), { target: { value: String(percentage) } });
    fireEvent.click(screen.getByRole('button', { name: '答える' }));
    expect(screen.getByText(/^正解。答えは/)).toBeInTheDocument();
    expect(screen.getByText(/直近 1 問中 1 問正解。/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('ホールド量'));
    fireEvent.change(screen.getByLabelText('答え（mil）'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: '答える' }));
    expect(screen.getByText(/^不正解。答えは/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '次の問題' }));
    expect(screen.getByLabelText('答え（mil）')).toHaveDisplayValue('');
    fireEvent.click(screen.getByRole('button', { name: '記録を消す' }));
    expect(screen.getByText('まだ解答がありません。')).toBeInTheDocument();
  });

  it('asks for a reason when holding fire and reviews a complete set of decisions', async () => {
    render(<ShootDecisionClient />);
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: '練習を開始' }));
    for (let index = 0; index < 15; index += 1) {
      expect(screen.getByText(`${index + 1} / 15`)).toBeInTheDocument();
      if (index % 2 === 0) {
        fireEvent.click(screen.getByRole('button', { name: '撃たない' }));
        fireEvent.click(within(screen.getByRole('group', { name: '撃たない理由' })).getAllByRole('button')[0]!);
      } else fireEvent.click(screen.getByRole('button', { name: '撃つ' }));
      expect(screen.getByText(/^根拠:/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: index === 14 ? '結果を見る' : '次の場面へ' }));
    }
    expect(screen.getByRole('heading', { name: '結果' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'もう一度' }));
    expect(screen.getByText('1 / 15')).toBeInTheDocument();
  });
});
