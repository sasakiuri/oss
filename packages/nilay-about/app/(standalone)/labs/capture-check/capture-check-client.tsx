'use client';

import { useEffect, useId, useState } from 'react';
import { LuDownload, LuPlus, LuPrinter, LuRotateCcw, LuTrash2 } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  DiscardedSaveNotice,
  LanguageMenu,
  StorageUnavailableNotice,
  ToolLayout,
  discardedSaveMessage,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import {
  BOARD_FIELDS,
  BOARD_FIELD_MAX_LENGTH,
  CAPTURE_SOURCES,
  CAPTURE_SOURCES_CHECKED_ON,
  NATIONAL_LIMITS,
  REWARD_CLASSES,
  SHOT_ITEMS,
  boardLines,
  formatExifDate,
  readPhotoMetadata,
  reiwaDate,
  rewardLine,
  rewardTotal,
  type BoardField,
  type BoardFields,
  type PhotoMetadata,
  type RewardClass,
} from '@/lib/capture-check';
import { labsTool } from '@/lib/labs-tools';
import { rehydrateLanguage, useLanguage, useSetLanguage, type Language } from '@/store';

import { CAPTURE_CHECK_STORAGE_KEY, REWARD_ROWS_MAX, useCaptureCheckStore } from './_store';
import styles from './board-print.module.css';
import { BoardSheet } from './board-sheet';
import { stampPhoto } from './stamp-photo';

type PhotoState =
  { kind: 'none' } | { kind: 'reading' } | { kind: 'read'; file: File; metadata: PhotoMetadata } | { kind: 'failed' };

export function CaptureCheckClient() {
  const { checked, solo, rows, toggleChecked, clearChecked, setSolo, addRow, updateRow, removeRow } =
    useCaptureCheckStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discarded = useDiscardedSave(CAPTURE_CHECK_STORAGE_KEY);
  const [ready, setReady] = useState(false);
  // The board carries a name, so it stays in the page and is never saved.
  const [board, setBoard] = useState<BoardFields>({ date: '', hunter: '', individual: '' });
  const [photo, setPhoto] = useState<PhotoState>({ kind: 'none' });
  const [stampError, setStampError] = useState(false);
  const formId = useId();
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useCaptureCheckStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const items = SHOT_ITEMS.filter((item) => solo || !item.soloOnly);
  const done = items.filter((item) => checked.includes(item.id)).length;
  const lines = boardLines(board);
  const total = rewardTotal(rows);
  const yen = (value: number) => new Intl.NumberFormat(language).format(value);

  const fieldLabel = (field: BoardField) =>
    ({
      date: t('捕獲日', 'Capture date'),
      hunter: t('捕獲従事者氏名', 'Hunter’s name'),
      individual: t('個体番号', 'Individual number'),
    })[field];

  const choosePhoto = (file: File | undefined) => {
    setStampError(false);
    if (!file) {
      setPhoto({ kind: 'none' });
      return;
    }
    setPhoto({ kind: 'reading' });
    file.arrayBuffer().then(
      (buffer) => setPhoto({ kind: 'read', file, metadata: readPhotoMetadata(buffer) }),
      () => setPhoto({ kind: 'failed' }),
    );
  };

  const stamp = () => {
    if (photo.kind !== 'read') return;
    setStampError(false);
    stampPhoto(photo.file, lines).then(
      (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `capture-${board.individual.trim() || 'photo'}.jpg`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      () => setStampError(true),
    );
  };

  const className = (value: RewardClass) =>
    value === 'custom' ? t('その他（金額を入力）', 'Other (enter the amount)') : NATIONAL_LIMITS[value].label[language];

  return (
    <AppLayout
      header={
        <AppHeader
          className="print:hidden"
          title={labsTool('capture-check').title[language]}
          actions={<LanguageMenu language={language} onLanguageChange={setLanguage} />}
        />
      }
    >
      <p className="sr-only" role="status" lang={language}>
        {discarded ? discardedSaveMessage(language) : ''}
      </p>
      <div lang={language} className="space-y-6 print:hidden" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={CAPTURE_CHECK_STORAGE_KEY} language={language} />
        <StorageUnavailableNotice available={storageAvailable} language={language} />
        <p className="text-sm text-on-surface-variant">
          {t(
            '撮影方法・マーキングの内容・追加の写真は事業実施主体（市町村など）が決めます。市町村の指定があれば、それに従ってください。',
            'The programme (usually the municipality) decides the shooting method, the marking and the extra photos. Follow its instructions where they differ.',
          )}
        </p>
        <ToolLayout
          resultLabel={t('標示板', 'Board')}
          primary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="shots" className="text-xl font-medium">
                {t('撮影のチェック', 'Photo checklist')}
              </h2>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 text-sm">
                <input type="checkbox" checked={solo} onChange={(event) => setSolo(event.target.checked)} />
                {t('1 人で捕獲した', 'Captured alone')}
              </label>
              <ul className="space-y-1 text-sm">
                {items.map((item) => (
                  <li key={item.id}>
                    <label className="flex min-h-12 cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={checked.includes(item.id)}
                        onChange={() => toggleChecked(item.id)}
                      />
                      <span>{item.text[language]}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <details className="text-xs text-on-surface-variant">
                <summary className="cursor-pointer">{t('マニュアルの記載', 'Manual text')}</summary>
                <ul className="mt-2 space-y-2">
                  {items.map((item) => (
                    <li key={item.id}>
                      <p className="font-medium">{item.text[language]}</p>
                      <p lang="ja">
                        「{item.quote}」（{item.where}）
                      </p>
                    </li>
                  ))}
                </ul>
              </details>
              <p className="text-sm font-medium">
                {t(`${done} / ${items.length} 項目`, `${done} of ${items.length} done`)}
              </p>
              <Button variant="outline" onClick={clearChecked} disabled={checked.length === 0}>
                <LuRotateCcw aria-hidden="true" />
                {t('チェックを外す（次の個体用）', 'Clear for the next animal')}
              </Button>
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="board" className="text-xl font-medium">
                {t('標示板', 'Board')}
              </h2>
              <div className="space-y-3">
                {BOARD_FIELDS.map((field) => (
                  <div key={field} className="space-y-1">
                    <label htmlFor={`${formId}-${field}`} className="block text-sm font-medium">
                      {fieldLabel(field)}
                    </label>
                    <input
                      id={`${formId}-${field}`}
                      type="text"
                      value={board[field]}
                      maxLength={BOARD_FIELD_MAX_LENGTH}
                      placeholder={field === 'date' ? '令和8年9月24日' : field === 'hunter' ? '山田 太郎' : '○－１'}
                      onChange={(event) => setBoard((state) => ({ ...state, [field]: event.target.value }))}
                    />
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const now = new Date();
                    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                    setBoard((state) => ({ ...state, date: reiwaDate(iso) ?? iso }));
                  }}
                >
                  {t('捕獲日に今日を入れる', 'Use today as the capture date')}
                </Button>
                <p className="text-xs text-on-surface-variant">
                  {t('空欄の項目は、手書き用の線を印刷します。', 'A blank item prints a line to write on.')}
                </p>
              </div>
              <figure className="space-y-2 rounded-sm bg-surface-container p-4">
                <BoardSheet
                  lines={lines}
                  label={t('印刷する標示板のプレビュー', 'Preview of the board')}
                  className="mx-auto w-full drop-shadow-sm"
                />
                <figcaption className="text-center text-sm text-on-surface-variant">
                  {t('A4 横', 'A4 landscape')}
                </figcaption>
              </figure>
              <Button className="w-full" onClick={() => window.print()}>
                <LuPrinter aria-hidden="true" />
                {t('標示板を印刷する', 'Print the board')}
              </Button>
              <p className="text-xs text-on-surface-variant">
                {t(
                  'マニュアルは、日付を印字できるカメラで本人（又は従事者証等）と個体を写す場合、ホワイトボード等を省略できるとしています。',
                  'The manual lets the board be left out when a camera that prints the date shows the hunter (or the certificate) and the animal.',
                )}
              </p>
            </Card>
          }
          secondary={
            <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
              <h2 id="photo" className="text-xl font-medium">
                {t('撮った写真の確認', 'Check a photo')}
              </h2>
              <div className="space-y-1">
                <label htmlFor={`${formId}-photo`} className="block text-sm font-medium">
                  {t('写真を選ぶ（JPEG）', 'Choose a photo (JPEG)')}
                </label>
                <input
                  id={`${formId}-photo`}
                  type="file"
                  accept="image/jpeg"
                  onChange={(event) => choosePhoto(event.target.files?.[0])}
                  className="block text-sm"
                />
              </div>
              <div role="status" className="space-y-1 text-sm">
                {photo.kind === 'reading' && <p>{t('読み取り中…', 'Reading…')}</p>}
                {photo.kind === 'failed' && (
                  <p className="text-destructive">
                    {t('写真を読み取れませんでした。', 'The photo could not be read.')}
                  </p>
                )}
                {photo.kind === 'read' && <MetadataSummary metadata={photo.metadata} language={language} />}
              </div>
              <Button variant="outline" onClick={stamp} disabled={photo.kind !== 'read'}>
                <LuDownload aria-hidden="true" />
                {t('標示を写真に書き込んで保存', 'Save the photo with the board text')}
              </Button>
              {stampError && (
                <p role="alert" className="text-sm text-destructive">
                  {t('写真に書き込めませんでした。', 'The text could not be drawn on the photo.')}
                </p>
              )}
              <ul className="list-disc space-y-1 pl-5 text-xs text-on-surface-variant">
                <li>
                  {t(
                    '書き込んだ写真には撮影日時・位置の情報が残りません。提出には元の写真も残しておき、書き込みを認めるかは市町村に確認してください。',
                    'The stamped copy has no date or position data. Keep the original, and ask the municipality whether a stamped photo is accepted.',
                  )}
                </li>
                <li>
                  {t(
                    'マニュアルは位置の記録に GPS 機能付きカメラ（スマートフォンを含む）の使用に努めるよう求めています。',
                    'The manual asks hunters to try to use a GPS-enabled camera (including a phone).',
                  )}
                </li>
              </ul>
            </Card>
          }
          extras={
            <>
              <ConditionSection
                id="reward"
                title={t('報償金の試算', 'Payment estimate')}
                summary={
                  rows.length === 0
                    ? t('未入力', 'Nothing entered')
                    : t(
                        `合計 ${yen(total.totalYen)} 円（${total.heads} 頭）`,
                        `Total ¥${yen(total.totalYen)} (${total.heads} head)`,
                      )
                }
              >
                <RewardTable
                  language={language}
                  rows={rows}
                  className={className}
                  onUpdate={updateRow}
                  onRemove={removeRow}
                />
                <Button variant="outline" onClick={addRow} disabled={rows.length >= REWARD_ROWS_MAX}>
                  <LuPlus aria-hidden="true" />
                  {t('行を追加', 'Add a row')}
                </Button>
                {rows.length > 0 && (
                  <p className="text-lg font-medium tabular-nums">
                    {t(`合計 ${yen(total.totalYen)} 円`, `Total ¥${yen(total.totalYen)}`)}
                    {total.invalid > 0 &&
                      t(`（入力が不正な ${total.invalid} 行を除く）`, ` (leaving out ${total.invalid} invalid rows)`)}
                  </p>
                )}
                <ul className="list-disc space-y-1 pl-5 text-xs text-on-surface-variant">
                  <li>
                    {t(
                      '国の欄は、鳥獣被害防止総合対策交付金の捕獲活動経費の上限単価です（令和8年度実施要領 別記4 第3、p.109）。実際の単価は上限の範囲内で地域が決め、捕獲が計画を上回ると調整されることがあります。',
                      'The national column is the upper limit of the capture activity cost in the national wildlife damage grant (FY2026 guideline, annex 4 part 3, p.109). The actual amount is set locally within the limit and can be adjusted when captures exceed the plan.',
                    )}
                  </li>
                  <li>
                    {t(
                      '幼獣は「その他」を選び、市町村から示された額を入れてください。出荷制限地域の特例は含みません。',
                      'For young animals, choose Other and enter the amount you were given. The rule for areas under shipping restrictions is not included.',
                    )}
                  </li>
                  <li>
                    {t(
                      '都道府県・市町村の欄には、要綱の上乗せ額を入れてください。',
                      'Enter the prefectural and municipal additions from your ordinance.',
                    )}
                  </li>
                </ul>
              </ConditionSection>
              <ConditionSection
                id="sources"
                title={t('出典', 'Sources')}
                summary={t(`確認日 ${CAPTURE_SOURCES_CHECKED_ON}`, `Checked ${CAPTURE_SOURCES_CHECKED_ON}`)}
              >
                <ul className="space-y-2 text-sm">
                  {Object.values(CAPTURE_SOURCES).map((source) => (
                    <li key={source.url}>
                      <a href={source.url} target="_blank" rel="noreferrer">
                        {source.publisher}「{source.title}」
                      </a>
                    </li>
                  ))}
                </ul>
              </ConditionSection>
            </>
          }
        />
      </div>
      <div className={styles.sheet}>
        <BoardSheet lines={lines} actualSize className="block" />
      </div>
    </AppLayout>
  );
}

function MetadataSummary({ metadata, language }: { metadata: PhotoMetadata; language: Language }) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      <dt className="text-on-surface-variant">{t('撮影日時', 'Taken')}</dt>
      <dd className={metadata.takenAt ? undefined : 'text-destructive'}>
        {metadata.takenAt ? formatExifDate(metadata.takenAt) : t('記録なし', 'Not recorded')}
      </dd>
      <dt className="text-on-surface-variant">{t('位置', 'Position')}</dt>
      <dd className={metadata.latitude === null ? 'text-destructive' : 'tabular-nums'}>
        {metadata.latitude !== null && metadata.longitude !== null
          ? `${metadata.latitude.toFixed(6)}, ${metadata.longitude.toFixed(6)}`
          : t(
              '記録なし（カメラの位置情報がオフか、送信・編集で消えた）',
              'Not recorded (location off in the camera, or lost when sent or edited)',
            )}
      </dd>
    </dl>
  );
}

function RewardTable({
  language,
  rows,
  className,
  onUpdate,
  onRemove,
}: {
  language: Language;
  rows: ReturnType<typeof useCaptureCheckStore.getState>['rows'];
  className: (value: RewardClass) => string;
  onUpdate: ReturnType<typeof useCaptureCheckStore.getState>['updateRow'];
  onRemove: (id: string) => void;
}) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const yen = (value: number) => new Intl.NumberFormat(language).format(value);
  if (rows.length === 0) return null;
  const numberInput = (label: string, value: number, change: (value: number) => void) => (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      step={1}
      aria-label={label}
      value={Number.isFinite(value) ? value : ''}
      onChange={(event) => change(event.target.value === '' ? Number.NaN : Number(event.target.value))}
      className="w-24"
    />
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm tabular-nums">
        <thead>
          <tr className="border-b border-outline-variant">
            <th className="py-2 pr-2 font-medium">{t('区分', 'Class')}</th>
            <th className="py-2 pr-2 font-medium">{t('国（円）', 'National (¥)')}</th>
            <th className="py-2 pr-2 font-medium">{t('都道府県（円）', 'Prefecture (¥)')}</th>
            <th className="py-2 pr-2 font-medium">{t('市町村（円）', 'Municipality (¥)')}</th>
            <th className="py-2 pr-2 font-medium">{t('頭数', 'Heads')}</th>
            <th className="py-2 pr-2 font-medium">{t('小計（円）', 'Subtotal (¥)')}</th>
            <th className="py-2 font-medium">
              <span className="sr-only">{t('削除', 'Delete')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const line = rewardLine(row);
            const n = index + 1;
            return (
              <tr key={row.id} className="border-b border-outline-variant align-top">
                <td className="py-2 pr-2">
                  <select
                    aria-label={t(`${n} 行目の区分`, `Class of row ${n}`)}
                    value={row.rewardClass}
                    onChange={(event) => onUpdate(row.id, { rewardClass: event.target.value as RewardClass })}
                  >
                    {REWARD_CLASSES.map((value) => (
                      <option key={value} value={value}>
                        {className(value)}
                      </option>
                    ))}
                  </select>
                  {row.rewardClass === 'custom' && (
                    <input
                      type="text"
                      className="mt-1"
                      maxLength={40}
                      aria-label={t(`${n} 行目の内容`, `What row ${n} is`)}
                      placeholder={t('例：シカ幼獣', 'e.g. young deer')}
                      value={row.label}
                      onChange={(event) => onUpdate(row.id, { label: event.target.value })}
                    />
                  )}
                </td>
                <td className="py-2 pr-2">
                  {row.rewardClass === 'custom'
                    ? numberInput(t(`${n} 行目の国の額`, `National amount, row ${n}`), row.nationalYen, (value) =>
                        onUpdate(row.id, { nationalYen: value }),
                      )
                    : yen(NATIONAL_LIMITS[row.rewardClass].yen)}
                </td>
                <td className="py-2 pr-2">
                  {numberInput(
                    t(`${n} 行目の都道府県の額`, `Prefecture amount, row ${n}`),
                    row.prefectureYen,
                    (value) => onUpdate(row.id, { prefectureYen: value }),
                  )}
                </td>
                <td className="py-2 pr-2">
                  {numberInput(
                    t(`${n} 行目の市町村の額`, `Municipality amount, row ${n}`),
                    row.municipalityYen,
                    (value) => onUpdate(row.id, { municipalityYen: value }),
                  )}
                </td>
                <td className="py-2 pr-2">
                  {numberInput(t(`${n} 行目の頭数`, `Heads, row ${n}`), row.heads, (value) =>
                    onUpdate(row.id, { heads: value }),
                  )}
                </td>
                <td className="py-2 pr-2">
                  {line ? (
                    yen(line.totalYen)
                  ) : (
                    <span className="text-destructive">{t('整数で入力', 'Whole numbers')}</span>
                  )}
                </td>
                <td className="py-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t(`${n} 行目を削除`, `Delete row ${n}`)}
                    onClick={() => onRemove(row.id)}
                  >
                    <LuTrash2 aria-hidden="true" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
