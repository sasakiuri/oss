'use client';

import { useEffect, useState } from 'react';
import { LuPlus, LuPrinter, LuTrash2 } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  DateField,
  LanguageMenu,
  NumberField,
  ResetButton,
  SelectField,
  ToolLayout,
  discardedSaveMessage,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import {
  AMMO_KIND_LABELS,
  AMMO_PLAN_ORDINANCE_URL,
  periodProblem,
  plannedQuantityText,
  rowProblem,
  totalsByKind,
} from '@/lib/ammo-purchase-plan';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { formatJapaneseDate } from '@/lib/hunting-log';
import { labsTool } from '@/lib/labs-tools';
import {
  AMMO_KINDS,
  AMMO_PLAN_MAX_QUANTITY,
  AMMO_PLAN_MAX_ROWS,
  AMMO_PLAN_MAX_TEXT,
  type AmmoKind,
} from '@/lib/schemas/ammo-purchase-plan';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { AMMO_PLAN_STORAGE_KEY, useAmmoPlanStore } from './_store';
import styles from './ammo-purchase-plan-print.module.css';

const validQuantity = (value: number) => Number.isInteger(value) && value >= 0 && value <= AMMO_PLAN_MAX_QUANTITY;

export function AmmoPurchasePlanClient() {
  const store = useAmmoPlanStore();
  const { periodFrom, periodTo, requested, rows } = store;
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discarded = useDiscardedSave(AMMO_PLAN_STORAGE_KEY);
  const [ready, setReady] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    void Promise.all([useAmmoPlanStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const period = periodProblem(periodFrom, periodTo);
  const rowsValid = rows.every((row) => validQuantity(row.quantity));
  const requestedValid = Object.values(requested).every((value) => value === null || validQuantity(value));
  const totals = rowsValid && requestedValid ? totalsByKind(store) : [];
  const rowProblems = rows.map((row) => rowProblem(row, periodFrom, periodTo));
  const printable = period === null && rows.length > 0 && rowsValid && rowProblems.every((problem) => problem === null);

  const periodText = (from: string, to: string) =>
    from && to ? `${formatJapaneseDate(from)}〜${formatJapaneseDate(to)}` : '';

  const print = () => {
    setSubmitted(true);
    if (printable) window.print();
  };

  return (
    <AppLayout
      header={
        <AppHeader
          className="print:hidden"
          title={labsTool('ammo-purchase-plan').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '譲受期間・申請数量・計画の行をすべて消します。',
                  en: 'Clears the period, the quantities applied for and every row of the plan.',
                }}
                onReset={store.reset}
              />
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
            </>
          }
        />
      }
    >
      <p className="sr-only" role="status" lang={language}>
        {discarded ? discardedSaveMessage(language) : ''}
      </p>
      <div lang={language} className="space-y-6 print:hidden" inert={!ready} aria-busy={!ready}>
        {discarded && <p className="text-sm text-on-surface-variant">{discardedSaveMessage(language)}</p>}
        {language === 'en' && (
          <p lang="en" className="text-sm">
            Japanese only. The sheet is attached to a Japanese application form.
          </p>
        )}
        {!storageAvailable && (
          <p lang="ja" role="status" className="text-sm text-on-surface-variant">
            このブラウザーでは保存できません。ページを離れると入力は消えるので、印刷して残してください。
          </p>
        )}
        <ToolLayout
          resultLabel="合計と確認"
          primary={
            <Card lang="ja" variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="period" className="text-xl font-medium">
                譲受期間と申請する数量
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <DateField
                  label="譲受期間の初日"
                  value={periodFrom}
                  onChange={(value) => store.setPeriod({ periodFrom: value })}
                />
                <DateField
                  label="譲受期間の末日"
                  value={periodTo}
                  onChange={(value) => store.setPeriod({ periodTo: value })}
                  invalid={period === 'order' || period === 'overOneYear'}
                  errorText={
                    period === 'order'
                      ? '初日より後の日を入力してください。'
                      : '譲受期間は 1 年を超えないこと（様式第 2 号 備考 3）。'
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                {AMMO_KINDS.map((kind) => (
                  <NumberField
                    key={kind}
                    label={`${AMMO_KIND_LABELS[kind].name}（申請数量）`}
                    unit={AMMO_KIND_LABELS[kind].unit}
                    value={requested[kind] ?? NaN}
                    step={1}
                    min={0}
                    onChange={(value) => store.setRequested(kind, Number.isNaN(value) ? null : value)}
                    invalid={requested[kind] !== null && !validQuantity(requested[kind])}
                    errorText="0 以上の整数を入力してください。"
                    hint="申請しない種類は空欄"
                  />
                ))}
              </div>
            </Card>
          }
          secondary={
            <Card lang="ja" variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="plan" className="text-xl font-medium">
                消費（購入）計画
              </h2>
              {rows.map((row, index) => {
                const problem = rowProblems[index];
                return (
                  <fieldset key={row.id} className="space-y-4 rounded-sm border border-outline-variant p-4">
                    <legend className="px-1 text-sm font-medium">予定 {index + 1}</legend>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <DateField
                        label="予定時期（から）"
                        value={row.from}
                        onChange={(value) => store.updateRow(row.id, { from: value })}
                        invalid={submitted && problem === 'dates' && !row.from}
                        errorText="日付を入力してください。"
                      />
                      <DateField
                        label="予定時期（まで）"
                        value={row.to}
                        onChange={(value) => store.updateRow(row.id, { to: value })}
                        invalid={
                          problem === 'order' ||
                          problem === 'outsidePeriod' ||
                          (submitted && problem === 'dates' && !row.to)
                        }
                        errorText={
                          problem === 'order'
                            ? '「から」より後の日を入力してください。'
                            : problem === 'outsidePeriod'
                              ? '譲受期間の中に収めてください。'
                              : '日付を入力してください。'
                        }
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <SelectField
                        label="種類"
                        value={row.kind}
                        onChange={(value) => store.updateRow(row.id, { kind: value as AmmoKind })}
                        options={AMMO_KINDS.map((kind) => ({ value: kind, label: AMMO_KIND_LABELS[kind].name }))}
                      />
                      <div className="min-w-0 space-y-2">
                        <label htmlFor={`name-${row.id}`} className="block text-sm font-medium">
                          名称（番径など）
                        </label>
                        <input
                          id={`name-${row.id}`}
                          type="text"
                          value={row.name}
                          maxLength={AMMO_PLAN_MAX_TEXT}
                          placeholder="例：12番"
                          onChange={(event) => store.updateRow(row.id, { name: event.target.value })}
                        />
                      </div>
                      <NumberField
                        label="数量"
                        unit={AMMO_KIND_LABELS[row.kind].unit}
                        value={row.quantity}
                        step={1}
                        min={0}
                        onChange={(value) => store.updateRow(row.id, { quantity: value })}
                        invalid={!validQuantity(row.quantity)}
                        errorText="0 以上の整数を入力してください。"
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      {(
                        [
                          ['reason', '事由', '例：狩猟'],
                          ['place', '予定場所', '例：〇〇射撃場'],
                          ['note', '備考', '例：無許可消費'],
                        ] as const
                      ).map(([key, label, example]) => (
                        <div key={key} className="min-w-0 space-y-2">
                          <label htmlFor={`${key}-${row.id}`} className="block text-sm font-medium">
                            {label}
                          </label>
                          <input
                            id={`${key}-${row.id}`}
                            type="text"
                            value={row[key]}
                            maxLength={AMMO_PLAN_MAX_TEXT}
                            placeholder={example}
                            onChange={(event) => store.updateRow(row.id, { [key]: event.target.value })}
                          />
                        </div>
                      ))}
                    </div>
                    <Button type="button" variant="outline" onClick={() => store.removeRow(row.id)}>
                      <LuTrash2 aria-hidden="true" />
                      この予定を削除
                    </Button>
                  </fieldset>
                );
              })}
              {rows.length < AMMO_PLAN_MAX_ROWS && (
                <Button type="button" variant="outline" onClick={store.addRow}>
                  <LuPlus aria-hidden="true" />
                  予定を追加
                </Button>
              )}
            </Card>
          }
          result={
            <Card lang="ja" variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="totals" className="text-xl font-medium">
                種類ごとの合計
              </h2>
              {totals.length > 0 && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-on-surface-variant">
                      <th scope="col" className="py-1 font-normal">
                        種類
                      </th>
                      <th scope="col" className="py-1 text-right font-normal">
                        計画の合計
                      </th>
                      <th scope="col" className="py-1 text-right font-normal">
                        申請数量
                      </th>
                      <th scope="col" className="py-1 text-right font-normal">
                        差
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant tabular-nums">
                    {totals.map((total) => {
                      const unit = AMMO_KIND_LABELS[total.kind].unit;
                      return (
                        <tr key={total.kind}>
                          <th scope="row" className="py-2 text-left font-normal">
                            {AMMO_KIND_LABELS[total.kind].name}
                            {total.names.length > 0 && (
                              <span className="block text-xs text-on-surface-variant">{total.names.join('、')}</span>
                            )}
                          </th>
                          <td className="py-2 text-right">
                            {total.planned.toLocaleString('ja-JP')} {unit}
                          </td>
                          <td className="py-2 text-right">
                            {total.requested === null ? '—' : `${total.requested.toLocaleString('ja-JP')} ${unit}`}
                          </td>
                          <td className={`py-2 text-right ${total.difference ? 'text-error' : ''}`}>
                            {total.difference === null
                              ? '—'
                              : total.difference === 0
                                ? '一致'
                                : `${total.difference > 0 ? '+' : ''}${total.difference.toLocaleString('ja-JP')}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <ul className="space-y-1 text-sm" role="status">
                {period === 'missing' && <li>譲受期間の初日と末日を入力してください。</li>}
                {period === 'overOneYear' && <li className="text-destructive">譲受期間が 1 年を超えています。</li>}
                {rowProblems.some((problem) => problem === 'outsidePeriod') && (
                  <li className="text-destructive">譲受期間の外にある予定があります。</li>
                )}
                {totals.some((total) => total.difference !== null && total.difference !== 0) && (
                  <li>計画の合計と申請数量が違う種類があります。</li>
                )}
              </ul>
              {submitted && !printable && (
                <p role="alert" className="rounded-sm bg-error-container p-4 text-sm text-on-error-container">
                  印刷の前に、譲受期間と各予定の日付・数量を確かめてください。
                </p>
              )}
              <Button className="w-full" onClick={print}>
                <LuPrinter aria-hidden="true" />
                別紙を印刷する
              </Button>
            </Card>
          }
          extras={
            <ConditionSection
              id="sources"
              title={<span lang="ja">様式と数量の定め</span>}
              summary={<span lang="ja">内閣府令 第 3 条・第 4 条・第 12 条</span>}
            >
              <div lang="ja" className="space-y-3 text-sm">
                <p>
                  猟銃用火薬類等譲受許可申請書は別記様式第 2
                  号（猟銃用火薬類等の譲渡、譲受け、輸入及び消費に関する内閣府令 第 3
                  条）。消費計画欄は「火薬類の消費（購入）計画について、別紙を作成すること」とされ、別紙は予定時期・予定数量・予定場所・備考の
                  4 欄です。
                </p>
                <blockquote className="space-y-1 border-l-4 border-outline-variant pl-4 text-on-surface-variant">
                  <p>備考 3　譲受期間は、1年を超えないこと。</p>
                  <p>
                    別紙 備考
                    2　予定数量欄には、消費又は購入する予定の火薬類の種類及び数量並びにその事由を記載すること。
                  </p>
                  <p>
                    別紙 備考 4　備考欄には、無許可製造、無許可消費その他消費又は購入することとなる理由を記載すること。
                  </p>
                </blockquote>
                <p className="text-on-surface-variant">
                  許可なく譲り受けられる数量は、狩猟者登録等の有効期間につき実包 300 個（うちライフル実包 50
                  個）以下など（同府令 第 4 条）。許可なく消費できる数量は、射的練習で 1 日に実包又は空包合計 400
                  個以下、鳥獣の捕獲で 1 日に合計 100 個以下など（同府令 第 12 条）。
                </p>
                <p>
                  <a href={AMMO_PLAN_ORDINANCE_URL} target="_blank" rel="noreferrer">
                    猟銃用火薬類等の譲渡、譲受け、輸入及び消費に関する内閣府令（e-Gov）
                  </a>
                </p>
              </div>
            </ConditionSection>
          }
        />
      </div>
      {printable && (
        <div className={styles.sheet} lang="ja">
          <p>別紙</p>
          <table>
            <caption>許可申請に係る種類の火薬類の消費（購入）計画</caption>
            <thead>
              <tr>
                <th scope="col">予定時期</th>
                <th scope="col">予定数量</th>
                <th scope="col">予定場所</th>
                <th scope="col">備考</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{periodText(row.from, row.to)}</td>
                  <td>{plannedQuantityText(row)}</td>
                  <td>{row.place}</td>
                  <td>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}
