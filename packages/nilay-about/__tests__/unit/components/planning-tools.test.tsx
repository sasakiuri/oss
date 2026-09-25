import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAmmoPlanStore } from '@/app/(standalone)/labs/ammo-purchase-plan/_store';
import { AmmoPurchasePlanClient } from '@/app/(standalone)/labs/ammo-purchase-plan/ammo-purchase-plan-client';
import { useCourseSchedulesStore } from '@/app/(standalone)/labs/course-schedules/_store';
import { CourseSchedulesClient } from '@/app/(standalone)/labs/course-schedules/course-schedules-client';
import { useHuntingCostsStore } from '@/app/(standalone)/labs/hunting-costs/_store';
import { HuntingCostsClient } from '@/app/(standalone)/labs/hunting-costs/hunting-costs-client';
import { useHuntingSeasonsStore } from '@/app/(standalone)/labs/hunting-seasons/_store';
import { HuntingSeasonsClient } from '@/app/(standalone)/labs/hunting-seasons/hunting-seasons-client';
import { usePermitDeadlinesStore } from '@/app/(standalone)/labs/permit-deadlines/_store';
import { PermitDeadlinesClient } from '@/app/(standalone)/labs/permit-deadlines/permit-deadlines-client';
import { useStorageStatus } from '@/lib/browser-storage';
import { downloadIcs } from '@/lib/ics';
import { useLanguageStore } from '@/store';

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
vi.mock('@/lib/ics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ics')>()),
  downloadIcs: vi.fn(),
}));

const loaded = () => waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
const change = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  useAmmoPlanStore.setState(useAmmoPlanStore.getInitialState(), true);
  useCourseSchedulesStore.setState(useCourseSchedulesStore.getInitialState(), true);
  useHuntingCostsStore.setState(useHuntingCostsStore.getInitialState(), true);
  useHuntingSeasonsStore.setState(useHuntingSeasonsStore.getInitialState(), true);
  usePermitDeadlinesStore.setState(usePermitDeadlinesStore.getInitialState(), true);
  window.localStorage.clear();
  useLanguageStore.setState({ language: 'ja' });
  useStorageStatus.setState({ available: true, discarded: [] });
  vi.mocked(downloadIcs).mockClear();
});

describe('planning tools', () => {
  it('recalculates registration costs, removes a registration, and restores the saved choice', async () => {
    const view = render(<HuntingCostsClient />);
    await loaded();
    await screen.findByText('通常の年は 18,300 円、初年度は 23,500 円、更新年は 21,200 円。');
    fireEvent.click(screen.getByLabelText(/道府県民税の所得割を納めなくてよい/));
    await screen.findByText('通常の年は 12,800 円、初年度は 18,000 円、更新年は 15,700 円。');
    fireEvent.click(screen.getByRole('button', { name: '都道府県を追加' }));
    fireEvent.change(screen.getAllByLabelText('都道府県')[1]!, { target: { value: '長野県' } });
    fireEvent.change(screen.getAllByLabelText('狩猟税の特例')[1]!, { target: { value: 'half' } });
    expect(useHuntingCostsStore.getState().registrations[1]).toMatchObject({ prefecture: '長野県', relief: 'half' });
    fireEvent.click(screen.getByRole('button', { name: '登録 2 を削除' }));
    expect(screen.getAllByLabelText('都道府県')).toHaveLength(1);
    view.unmount();
    render(<HuntingCostsClient />);
    await loaded();
    expect(screen.getByLabelText(/道府県民税の所得割を納めなくてよい/)).toBeChecked();
    fireEvent.click(screen.getAllByLabelText('第一種銃猟', { exact: true })[0]!);
    expect(screen.getByText('東京都：登録する免許の種類を選んでください。')).toBeInTheDocument();
  });

  it('calculates renewal windows and exports both licence and additional deadlines', async () => {
    render(<PermitDeadlinesClient />);
    await loaded();
    change('生年月日', '1980-06-10');
    change('許可を受けた日', '2026-04-01');
    expect(screen.getByText('2028年6月10日')).toBeInTheDocument();
    expect(screen.getByText('2028年4月10日 – 2028年5月10日')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '狩猟免許を追加' }));
    change('試験を受けた日', '2026-07-20');
    expect(screen.getByText('2029年9月14日')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '期限を追加' }));
    change('項目 1', '保険');
    change('日付', '2026-12-31');
    fireEvent.click(screen.getByRole('button', { name: 'カレンダー（.ics）に書き出す' }));
    const [filename, calendar] = vi.mocked(downloadIcs).mock.calls[0]!;
    expect(filename).toMatch(/^permit-deadlines-.*\.ics$/);
    expect(calendar).toContain('DTSTART;VALUE=DATE:20261231');
    expect(calendar).toContain('保険');
    fireEvent.click(screen.getByRole('button', { name: 'この免許を削除' }));
    fireEvent.click(screen.getByRole('button', { name: '項目 1 を削除' }));
    expect(screen.queryByLabelText('試験を受けた日')).not.toBeInTheDocument();
    change('狩猟に最後に使った日', '2020-01-10');
    expect(
      screen.getByText('すべての用途が条文の期間に達しています。許可の取消しの対象になりえます。'),
    ).toBeInTheDocument();
  });

  it('compares purchase quantities and refuses to print an invalid period', async () => {
    render(<AmmoPurchasePlanClient />);
    await loaded();
    change('譲受期間の初日', '2026-10-01');
    change('譲受期間の末日', '2027-09-30');
    change(/^実包（申請数量）/, '200');
    fireEvent.click(screen.getByRole('button', { name: '予定を追加' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: '数量 (個)' }), { target: { value: '150' } });
    expect(screen.getByText('計画の合計と申請数量が違う種類があります。')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton', { name: '数量 (個)' }), { target: { value: '200' } });
    expect(screen.getByRole('cell', { name: '一致' })).toBeInTheDocument();
    change('譲受期間の末日', '2027-10-01');
    fireEvent.click(screen.getByRole('button', { name: '別紙を印刷する' }));
    expect(screen.getByRole('alert')).toHaveTextContent('印刷の前に、譲受期間と各予定の日付・数量を確かめてください。');
    fireEvent.click(screen.getByRole('button', { name: 'この予定を削除' }));
    expect(screen.queryByRole('spinbutton', { name: '数量 (個)' })).not.toBeInTheDocument();
  });

  it('distinguishes uncollected season rules from an extension and exports the chosen year', async () => {
    render(<HuntingSeasonsClient />);
    await loaded();
    change('都道府県', '北海道');
    expect(screen.getByText(/この県の延長・制限は未収録です。/)).toBeInTheDocument();
    change('都道府県', '東京都');
    change('日付', '2027-02-20');
    expect(screen.getByText(/^法定の狩猟期間外ですが、県の延長の期間内です/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /年度の猟期をカレンダー/ }));
    expect(downloadIcs).toHaveBeenCalledWith('hunting-season-2026-東京都.ics', expect.stringContaining('BEGIN:VEVENT'));
  });

  it('saves a course date, exports it, and removes it without retaining an exportable event', async () => {
    render(<CourseSchedulesClient />);
    await loaded();
    change('住所地の都道府県', '沖縄県');
    expect(screen.getByText(/この都道府県のページは未収録です。/)).toBeInTheDocument();
    const exportButton = screen.getByRole('button', { name: 'カレンダー（.ics）に書き出す' });
    expect(exportButton).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '予定を追加' }));
    change('日付（開始日）', '2026-12-02');
    fireEvent.click(exportButton);
    expect(downloadIcs).toHaveBeenCalledWith(
      expect.stringMatching(/^course-schedules-/),
      expect.stringContaining('DTSTART;VALUE=DATE:20261202'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'この予定を削除' }));
    expect(exportButton).toBeDisabled();
    expect(within(document.body).queryByLabelText('日付（開始日）')).not.toBeInTheDocument();
  });
});
