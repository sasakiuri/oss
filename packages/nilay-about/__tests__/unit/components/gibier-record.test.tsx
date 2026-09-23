import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GIBIER_RECORD_STORAGE_KEY,
  readSavedGibierRecords,
  useGibierRecordStore,
} from '@/app/(standalone)/labs/gibier-record/_store';
import { GibierRecordClient } from '@/app/(standalone)/labs/gibier-record/gibier-record-client';
import { GibierRecordSheet } from '@/app/(standalone)/labs/gibier-record/gibier-record-sheet';
import { useStorageStatus } from '@/lib/browser-storage';
import { createGibierRecord } from '@/lib/schemas/gibier-record';
import { useLanguageStore } from '@/store';

// Only the shared chrome is stubbed: it needs the Next.js app router, which a unit render has not mounted.
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

const renderTool = async () => {
  const view = render(<GibierRecordClient />);
  await waitFor(() => expect(view.container.querySelector('[aria-busy="true"]')).toBeNull());
  return view;
};

const choose = (group: RegExp | string, option: string) =>
  fireEvent.click(within(screen.getByRole('group', { name: group })).getByRole('radio', { name: option }));

const type = (label: RegExp | string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const checks = () => screen.getByRole('region', { name: '確認と印刷' });

beforeEach(() => {
  useLanguageStore.setState({ language: 'ja' });
  useGibierRecordStore.setState(useGibierRecordStore.getInitialState(), true);
  window.localStorage.clear();
  useStorageStatus.setState({ available: true, discarded: [] });
});
afterEach(() => vi.restoreAllMocks());

describe('first render', () => {
  it('renders the form and the checks before the saved records are read, held busy', () => {
    const { container } = render(<GibierRecordClient />);
    const busy = container.querySelector('[aria-busy="true"]');
    expect(busy).toContainElement(screen.getByLabelText('捕獲者名'));
    expect(busy).toContainElement(screen.getByRole('heading', { name: '確認と印刷' }));
    // Nothing is announced before the saved record is known.
    for (const region of screen.getAllByRole('status').filter((node) => node.className.includes('sr-only')))
      expect(region).toBeEmptyDOMElement();
  });
});

describe('the abnormality check', () => {
  it('quotes the guideline as soon as one item is はい and names the item', async () => {
    await renderTool();
    expect(within(checks()).queryByRole('alert')).toBeNull();
    expect(checks()).toHaveTextContent('異常の確認（11 項目）未回答 11 項目');
    choose(/^ホ\s脱毛が著しい/, 'はい');
    expect(checks()).toHaveTextContent('異常の確認（11 項目）「はい」1 項目未回答 10 項目');
    const alert = within(checks()).getByRole('alert');
    expect(within(alert).getByRole('listitem')).toHaveTextContent(/^ホ\s脱毛が著しい$/);
    expect(alert).toHaveTextContent('異常が一つでも見られる場合は、食用に供してはならない。');
    // The decision on accepting the animal stays with the facility.
    expect(checks()).toHaveTextContent('受入の可否は、食肉処理業者が');
  });

  it('says only that all eleven were answered いいえ, never that the meat is fit to eat', async () => {
    await renderTool();
    for (const group of screen
      .getAllByRole('group')
      .filter((node) => /^[イロハニホヘトチリヌル]\s/.test(node.textContent ?? ''))) {
      fireEvent.click(within(group).getByRole('radio', { name: 'いいえ' }));
    }
    expect(checks()).toHaveTextContent('異常の確認（11 項目）すべて「いいえ」');
    expect(checks().textContent).not.toMatch(/食用にできます|安全です|受け入れられます/);
  });
});

describe('temperature, time and the abdomen', () => {
  it('compares the temperature with the handbook figure for the species', async () => {
    await renderTool();
    choose('捕獲獣種', 'イノシシ');
    type(/温度計測定/, '41.9');
    expect(checks()).not.toHaveTextContent('手引書が示す目安');
    type(/温度計測定/, '42');
    expect(checks()).toHaveTextContent('測定した体温 42℃ は、手引書が示す目安（イノシシ 42℃）以上です。');
    choose('捕獲獣種', 'シカ');
    type(/温度計測定/, '40');
    expect(checks()).toHaveTextContent('（シカ 40℃）以上です。');
  });

  it('marks a temperature that is not a number', async () => {
    await renderTool();
    type(/温度計測定/, '４２');
    expect(screen.getByLabelText(/温度計測定/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('半角の数字で入力してください（例：41.5）。')).toBeInTheDocument();
  });

  it('counts from the start of bleeding to the delivery, and catches a reversed pair', async () => {
    await renderTool();
    choose('放血', '有');
    type('放血の開始日時', '2026-09-23T06:30');
    type('施設（または移動式解体処理車）への搬入日時', '2026-09-23T08:35');
    expect(checks()).toHaveTextContent('放血開始から搬入まで');
    expect(checks()).toHaveTextContent('2 時間 5 分');
    type('施設（または移動式解体処理車）への搬入日時', '2026-09-23T06:00');
    expect(checks()).toHaveTextContent('搬入日時が放血の開始日時より前です。');
    type('施設（または移動式解体処理車）への搬入日時', '2026-09-23T08:35');
    // No upper limit is invented: the guideline sets none.
    expect(checks()).toHaveTextContent('上限の時間はガイドラインにありません。');
  });

  it('counts to the present before a delivery time is entered', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date(2026, 8, 23, 7, 0));
    try {
      await renderTool();
      choose('放血', '有');
      type('放血の開始日時', '2026-09-23T06:30');
      expect(checks()).toHaveTextContent('放血開始から現在まで');
      expect(checks()).toHaveTextContent('30 分');
      act(() => {
        vi.advanceTimersByTime(30 * 60 * 1000);
      });
      expect(checks()).toHaveTextContent('1 時間 0 分');
    } finally {
      vi.useRealTimers();
    }
  });

  it('points to 第 2 の 1（1）ロ when the abdomen is ticked for a gun capture', async () => {
    await renderTool();
    fireEvent.click(screen.getByRole('checkbox', { name: '腹部' }));
    // Without a method or the use of a gun recorded, the site may be a bullet or not: it asks.
    expect(checks()).not.toHaveTextContent('銃を使った個体で');
    expect(checks()).toHaveTextContent('止め刺しに銃を使ったかどうかを記録してください');
    choose('捕獲方法', '銃');
    expect(checks()).toHaveTextContent('銃を使った個体で、部位に「腹部」が選ばれています。');
    expect(checks()).toHaveTextContent('「腹部に着弾した個体は、食用に供さないこと」');
  });
});

describe('the list of records', () => {
  it('starts the next animal with the hunter carried over and the checks empty', async () => {
    await renderTool();
    type('捕獲者名', '山田太郎');
    type('狩猟免許番号', '第123号');
    choose('捕獲者の健康状態（発熱、下痢、嘔吐、風邪症状）', '無');
    choose(/^イ\s/, 'はい');
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    fireEvent.click(screen.getByRole('button', { name: '次の 1 頭を記録する' }));
    expect(screen.getByRole('heading', { name: '記録の一覧（2 頭）' })).toBeInTheDocument();
    // The blank form is brought into view.
    expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByRole('heading', { name: '捕獲' }));
    expect(screen.getByLabelText('捕獲者名')).toHaveValue('山田太郎');
    expect(screen.getByLabelText('狩猟免許番号')).toHaveValue('第123号');
    expect(
      within(screen.getByRole('group', { name: '捕獲者の健康状態（発熱、下痢、嘔吐、風邪症状）' })).getByRole('radio', {
        name: '無',
      }),
    ).not.toBeChecked();
    expect(within(checks()).queryByRole('alert')).toBeNull();
    // The first record is still there to go back to.
    fireEvent.click(screen.getByRole('button', { name: '開く' }));
    expect(within(checks()).getByRole('alert')).toHaveTextContent(/イ\s足取りがおぼつかない（捕獲時）/);
  });

  it('deletes one record after asking', async () => {
    await renderTool();
    fireEvent.click(screen.getByRole('button', { name: '次の 1 頭を記録する' }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const deleteButtons = () => screen.getAllByRole('button', { name: /の記録を削除$/ });
    fireEvent.click(deleteButtons()[0]!);
    expect(deleteButtons()).toHaveLength(2);
    fireEvent.click(deleteButtons()[0]!);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(deleteButtons()).toHaveLength(1);
    // Said beside the list, not inside the closed section on saving.
    expect(screen.getByText('記録を削除しました。')).toBeVisible();
  });

  it('empties the record on screen from the reset button and leaves the others', async () => {
    await renderTool();
    type('捕獲者名', '山田太郎');
    fireEvent.click(screen.getByRole('button', { name: '次の 1 頭を記録する' }));
    type('捕獲時の天候', '晴れ');
    fireEvent.click(screen.getByRole('button', { name: '入力を初期値に戻す' }));
    fireEvent.click(screen.getByRole('button', { name: '初期値に戻す' }));
    expect(screen.getByLabelText('捕獲者名')).toHaveValue('');
    expect(screen.getByLabelText('捕獲時の天候')).toHaveValue('');
    expect(screen.getByRole('heading', { name: '記録の一覧（2 頭）' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '開く' }));
    expect(screen.getByLabelText('捕獲者名')).toHaveValue('山田太郎');
  });
});

describe('saving on this device', () => {
  it('keeps the records in this browser under its own key', async () => {
    await renderTool();
    type('捕獲者名', '山田太郎');
    expect(window.localStorage.getItem(GIBIER_RECORD_STORAGE_KEY)).toContain('山田太郎');
  });

  it('deletes every record after asking, and says so', async () => {
    await renderTool();
    type('捕獲者名', '山田太郎');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /^この端末への保存/ }));
    fireEvent.click(screen.getByRole('button', { name: 'すべての記録を削除' }));
    expect(screen.getByLabelText('捕獲者名')).toHaveValue('');
    expect(window.localStorage.getItem(GIBIER_RECORD_STORAGE_KEY)).toBeNull();
    expect(screen.getByText('すべての記録を削除しました。')).toBeInTheDocument();
  });

  it('opens the readable records and says that the rest could not be read', async () => {
    const good = { ...createGibierRecord('good', '2026-09-23T00:00:00.000Z'), hunterName: '山田太郎' };
    window.localStorage.setItem(
      GIBIER_RECORD_STORAGE_KEY,
      JSON.stringify({ state: { records: [good, { id: 'bad', species: 'bear' }], currentId: 'bad' }, version: 0 }),
    );
    await renderTool();
    expect(screen.getByLabelText('捕獲者名')).toHaveValue('山田太郎');
    expect(
      screen.getAllByText(
        '保存されていた記録の一部または全部を読み取れなかったため、読み取れた記録だけで開いています。',
      ),
    ).not.toHaveLength(0);
  });

  it('starts empty, and says so, when nothing saved can be read', async () => {
    window.localStorage.setItem(GIBIER_RECORD_STORAGE_KEY, '{not json');
    await renderTool();
    expect(screen.getByLabelText('捕獲者名')).toHaveValue('');
    expect(screen.getAllByText(/読み取れなかったため/)).not.toHaveLength(0);
  });

  it('keeps only the first of two records that share an id', () => {
    const a = createGibierRecord('same', '');
    const read = readSavedGibierRecords({ records: [a, { ...a, hunterName: 'x' }], currentId: 'same' });
    expect(read.records).toHaveLength(1);
    expect(read.records[0]!.hunterName).toBe('');
    expect(read.lost).toBe(true);
  });
});

describe('language', () => {
  it('says in English that the tool is in Japanese only, and keeps the form in Japanese', async () => {
    await renderTool();
    expect(screen.getByText('ジビエの捕獲時記録票')).toBeInTheDocument();
    act(() => useLanguageStore.setState({ language: 'en' }));
    expect(screen.getByText('Game Meat Capture Record')).toBeInTheDocument();
    expect(screen.getByText(/This tool is in Japanese only/)).toBeInTheDocument();
    expect(screen.getByLabelText('捕獲者名')).toBeInTheDocument();
  });
});

describe('the printed sheet', () => {
  it('prints the entries in the order of 様式 2 and leaves the facility boxes empty', () => {
    const record = {
      ...createGibierRecord('a', ''),
      species: 'boar' as const,
      hunterName: '山田太郎',
      licenseNumber: '第123号',
      capturedAt: '2026-09-23T06:10',
      bleeding: 'yes' as const,
      bleedingStartedAt: '2026-09-23T06:30',
      deliveredAt: '2026-09-23T08:35',
      bodyTemperature: '41.5',
      abnormalities: { ...createGibierRecord('a', '').abnormalities, wound: 'yes' as const },
    };
    const markup = renderToStaticMarkup(<GibierRecordSheet record={record} />);
    expect(markup).toContain('イノシシ');
    expect(markup).toContain('氏名：山田太郎');
    expect(markup).toContain('2026/09/23 06:10');
    expect(markup).toContain('（放血開始から 2 時間 5 分）');
    expect(markup).toContain('温度計測定：41.5℃');
    expect(markup).toContain('受入個体管理番号（施設記入）');
    expect(markup.indexOf('1. 捕獲に関する情報')).toBeLessThan(markup.indexOf('2. 個体に関する情報'));
    expect(markup.match(/>はい</g)).toHaveLength(1);
  });
});

describe('review fixes', () => {
  it('reads a list deleted in another tab without writing anything back', async () => {
    await renderTool();
    type('捕獲者名', '山田太郎');
    const setItem = vi.spyOn(window.Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(window.Storage.prototype, 'removeItem');
    // What the other tab leaves behind after its delete, and the event this tab receives for it.
    window.localStorage.removeItem(GIBIER_RECORD_STORAGE_KEY);
    removeItem.mockClear();
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: GIBIER_RECORD_STORAGE_KEY, newValue: null }));
      await Promise.resolve();
    });
    expect(screen.getByLabelText('捕獲者名')).toHaveValue('');
    // A write or a removal here would reach the other tab as an event of its own and start it over.
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(GIBIER_RECORD_STORAGE_KEY)).toBeNull();
  });

  it('takes up a list written in another tab without writing it back', async () => {
    await renderTool();
    const other = { ...createGibierRecord('other', '2026-09-23T00:00:00.000Z'), hunterName: '佐藤花子' };
    const value = JSON.stringify({ state: { records: [other], currentId: 'other' }, version: 0 });
    window.localStorage.setItem(GIBIER_RECORD_STORAGE_KEY, value);
    const setItem = vi.spyOn(window.Storage.prototype, 'setItem');
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: GIBIER_RECORD_STORAGE_KEY, newValue: value }));
      await Promise.resolve();
    });
    expect(screen.getByLabelText('捕獲者名')).toHaveValue('佐藤花子');
    expect(setItem).not.toHaveBeenCalled();
  });

  it('records the kill and the organs the guideline asks for, and prints them', async () => {
    await renderTool();
    choose(/^止め刺しに銃を使った/, 'はい');
    type(/^止め刺しの方法/, '頭部を撃った');
    choose('内臓摘出', '有');
    type(/^内臓摘出の方法/, '吊り下げて摘出');
    choose(/^内臓の異常/, '有');
    type('内臓の異常の内容', '肝臓に白斑');
    choose(/^臭気の異常/, '無');
    const saved = window.localStorage.getItem(GIBIER_RECORD_STORAGE_KEY) ?? '';
    for (const text of ['頭部を撃った', '吊り下げて摘出', '肝臓に白斑']) expect(saved).toContain(text);
    const record = useGibierRecordStore.getState().records[0]!;
    const markup = renderToStaticMarkup(<GibierRecordSheet record={record} />);
    expect(markup).toContain('止め刺しの方法 ※');
    expect(markup).toContain('銃の使用：はい');
    expect(markup).toContain('方法：吊り下げて摘出');
    expect(markup).toContain('内臓の異常：有（肝臓に白斑）');
    expect(markup).toContain('臭気の異常：無');
  });

  it('warns about the abdomen after a trap when the kill was by gun, and asks while that is unknown', async () => {
    await renderTool();
    choose('捕獲方法', 'くくりわな');
    fireEvent.click(screen.getByRole('checkbox', { name: '腹部' }));
    expect(checks()).toHaveTextContent('止め刺しに銃を使ったかどうかを記録してください');
    choose(/^止め刺しに銃を使った/, 'はい');
    expect(checks()).toHaveTextContent('銃を使った個体で、部位に「腹部」が選ばれています。');
    choose(/^止め刺しに銃を使った/, 'いいえ');
    expect(checks()).not.toHaveTextContent('腹部に着弾した個体');
  });

  it('asks the widened ト of 様式 2 and says how it differs from the guideline', async () => {
    await renderTool();
    choose(/^ト\s大きな外傷や化膿部位、皮膚の炎症やかさぶたが見られる$/, 'はい');
    const alert = within(checks()).getByRole('alert');
    expect(alert).toHaveTextContent('ガイドラインの ト は「大きな外傷が見られるもの」');
  });

  it('does not blame a delivery time that was never entered for a start in the future', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date(2026, 8, 23, 7, 0));
    try {
      await renderTool();
      choose('放血', '有');
      type('放血の開始日時', '2026-09-23T08:00');
      expect(checks()).toHaveTextContent('放血の開始日時が現在より後です。');
      expect(checks()).not.toHaveTextContent('搬入日時が放血の開始日時より前です。');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('details behind an answer switched to 無', () => {
  const sheetOf = () =>
    renderToStaticMarkup(<GibierRecordSheet record={useGibierRecordStore.getState().records[0]!} />);

  it('does not print the method and findings of an evisceration answered 無, and brings them back on 有', async () => {
    // The steps of the re-review: 有, fill in, then 無.
    await renderTool();
    choose('内臓摘出', '有');
    type(/^内臓摘出の方法/, '吊り下げて摘出');
    choose(/^内臓の異常/, '有');
    type('内臓の異常の内容', '肝臓に白斑');
    expect(sheetOf()).toContain('方法：吊り下げて摘出');
    choose('内臓摘出', '無');
    const sheet = sheetOf();
    expect(sheet).toContain('摘出：無');
    expect(sheet).not.toContain('吊り下げて摘出');
    expect(sheet).not.toContain('内臓の異常');
    expect(sheet).not.toContain('肝臓に白斑');
    // The reader is told that what was typed is kept but left out.
    expect(checks()).toHaveTextContent('印刷と確認に含めていません');
    choose('内臓摘出', '有');
    expect(screen.getByLabelText(/^内臓摘出の方法/)).toHaveValue('吊り下げて摘出');
    expect(sheetOf()).toContain('内臓の異常：有（肝臓に白斑）');
    expect(checks()).not.toHaveTextContent('印刷と確認に含めていません');
  });

  it('does the same for cooling and bleeding, and stops counting time from a bleeding answered 無', async () => {
    await renderTool();
    choose('運搬時の冷却', '有');
    type('冷却の方法', '氷');
    choose('放血', '有');
    type('放血の開始日時', '2026-09-23T06:30');
    type('放血の場所', '沢');
    type('施設（または移動式解体処理車）への搬入日時', '2026-09-23T08:35');
    expect(checks()).toHaveTextContent('2 時間 5 分');
    choose('運搬時の冷却', '無');
    choose('放血', '無');
    const sheet = sheetOf();
    expect(sheet).toContain('冷却：無');
    expect(sheet).not.toContain('方法：氷');
    expect(sheet).toContain('放血：無');
    expect(sheet).not.toContain('場所：沢');
    expect(sheet).not.toContain('放血開始から');
    expect(checks()).not.toHaveTextContent('2 時間 5 分');
  });
});
