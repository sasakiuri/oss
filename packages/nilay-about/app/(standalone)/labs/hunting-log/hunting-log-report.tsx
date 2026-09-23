'use client';

import {
  describeCatches,
  LICENSE_LABELS,
  formatJapaneseDate,
  reportPlace,
  type ReportDraft,
  type ReportRow,
} from '@/lib/hunting-log';
import type { Prefecture } from '@/lib/schemas/hunting-log';
import { cn } from '@/lib/utils';

const cell = 'border border-current px-2 py-1 text-left align-top';

/** The columns of the report on the back of 様式第十七, in its order. 備考 is left for the prefecture's instructions. */
function ReportTable({ rows, caption }: { rows: readonly ReportRow[]; caption: string }) {
  return (
    <table className="w-full border-collapse text-sm">
      <caption className="pb-1 text-left font-medium">{caption}</caption>
      <thead>
        <tr>
          <th scope="col" className={cell}>
            免許の種類
          </th>
          <th scope="col" className={cell}>
            捕獲場所
          </th>
          <th scope="col" className={cell}>
            鳥獣の種類
          </th>
          <th scope="col" className={cn(cell, 'text-right')}>
            鳥獣の数量
          </th>
          <th scope="col" className={cell}>
            備考
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={5} className={cell}>
              捕獲の記録なし
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={`${row.license}-${row.place}-${row.species}`}>
              <td className={cell}>{LICENSE_LABELS[row.license]}</td>
              <td className={cell}>{row.place || '（未入力）'}</td>
              <td className={cell}>{row.species}</td>
              <td className={cn(cell, 'text-right tabular-nums')}>{row.count}</td>
              <td className={cell} />
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

interface HuntingLogReportProps {
  draft: ReportDraft;
  prefecture: Prefecture;
  /** Adds the header, the day-by-day log and the notes for printing. */
  full?: boolean;
  className?: string;
}

/** Japanese in both interface languages: it is copied onto a Japanese form. */
export function HuntingLogReport({ draft, prefecture, full = false, className }: HuntingLogReportProps) {
  return (
    <div lang="ja" className={cn('space-y-4', className)}>
      {full && (
        <header className="space-y-1">
          <h2 className="text-lg font-medium">狩猟の結果の報告（下書き）</h2>
          <p className="text-sm">
            報告先：{prefecture}知事　登録年度：{draft.period.season}年度（有効期間{' '}
            {formatJapaneseDate(draft.period.start)}〜{formatJapaneseDate(draft.period.end)}
            {draft.period.fromRegistrationDate ? '' : '。登録日が未入力のため、開始日は法定の最も早い日'}）
          </p>
          <p className="text-sm">
            報告期限の目安：{formatJapaneseDate(draft.deadline)}
            （有効期間が上記の日に満了した場合。実際の期限は登録都道府県の案内で確認してください）
          </p>
        </header>
      )}
      <ReportTable
        rows={draft.main}
        caption={draft.split ? '報告事項（装薬銃を使用して捕獲等をした鳥獣）' : '報告事項'}
      />
      {draft.split && <ReportTable rows={draft.air} caption="報告事項（空気銃を使用して捕獲等をした鳥獣）" />}
      {full && (
        <>
          <section className="space-y-1">
            <h3 className="font-medium">出猟の記録（{draft.days} 日）</h3>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th scope="col" className={cell}>
                    出猟日
                  </th>
                  <th scope="col" className={cell}>
                    市町村
                  </th>
                  <th scope="col" className={cell}>
                    メッシュ番号等
                  </th>
                  <th scope="col" className={cell}>
                    猟法
                  </th>
                  <th scope="col" className={cell}>
                    捕獲
                  </th>
                  <th scope="col" className={cell}>
                    メモ
                  </th>
                </tr>
              </thead>
              <tbody>
                {draft.outings.map((outing) => (
                  <tr key={outing.id}>
                    <td className={cn(cell, 'whitespace-nowrap')}>{formatJapaneseDate(outing.date)}</td>
                    <td className={cell}>{outing.municipality}</td>
                    <td className={cell}>{outing.mesh || (reportPlace(outing) ? '' : '（未入力）')}</td>
                    <td className={cell}>{LICENSE_LABELS[outing.license]}</td>
                    <td className={cell}>{describeCatches(outing) ?? 'なし'}</td>
                    <td className={cell}>{outing.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li>これは下書きです。登録都道府県の定める方法（狩猟者登録証の報告欄への記入など）で提出してください。</li>
            <li>備考欄は空けてあります。様式や記載事項は登録都道府県の案内に従ってください。</li>
            <li>鳥獣の種類別の数は、捕獲場所ごとに合計しています。</li>
          </ul>
        </>
      )}
    </div>
  );
}
