'use client';

import { useEffect, useRef, useState } from 'react';
import { LuDownload, LuFileText, LuPrinter, LuTrash2 } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  DiscardedSaveNotice,
  LanguageMenu,
  SegmentedControl,
  SelectField,
  ToolLayout,
  discardedSaveMessage,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { buildImagePdf } from '@/lib/image-pdf';
import { labsTool } from '@/lib/labs-tools';
import {
  TRAP_TAG_FIELDS,
  TRAP_TAG_MAX_FIELD_LENGTH,
  validateTrapTagFields,
  type TrapTagFieldError,
  type TrapTagFieldKey,
  type TrapTagPurpose,
} from '@/lib/schemas/trap-tag';
import {
  TRAP_TAG_CHAR_SIZES_MM,
  TRAP_TAG_COPIES,
  formatMillimetres,
  getTrapTagLayout,
  sideValues,
  trapTagSides,
  type TrapTagCharSizeMm,
  type TrapTagCopies,
  type TrapTagLayout,
} from '@/lib/trap-tag';
import {
  TRAP_TAG_CSV_HEADERS,
  TRAP_TAG_CSV_MAX_ROWS,
  readTrapTagCsv,
  trapTagCsvTemplate,
  type TrapTagCsvResult,
} from '@/lib/trap-tag-csv';
import { cn } from '@/lib/utils';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { TRAP_TAG_STORAGE_KEY, readSavedRemember, useTrapTagStore } from './_store';
import { rasterizeSheet } from './rasterize';
import styles from './trap-tag-print.module.css';
import { TrapTagSheet } from './trap-tag-sheet';

// The items are printed in Japanese, so the examples stay Japanese in both languages.
const FIELD_EXAMPLES: Record<TrapTagFieldKey, string> = {
  address: '東京都千代田区霞が関1-2-2',
  name: '山田太郎',
  governor: '東京都知事',
  fiscalYear: '令和7年度',
  registrationNumber: '第12345号',
  authority: '東京都知事',
  validPeriod: '令和7年4月1日〜令和8年3月31日',
  permitNumber: '第123号',
  species: 'ニホンジカ',
};

const LAW_URL = 'https://laws.e-gov.go.jp/law/414AC0000000088';
const REGULATION_URL = 'https://laws.e-gov.go.jp/law/414M60001000028';

export function TrapTagClient() {
  const {
    purpose,
    charSizeMm,
    copies,
    remember,
    fields,
    blanks,
    twoSided,
    setPurpose,
    setCharSizeMm,
    setCopies,
    setRemember,
    setField,
    toggleBlank,
    setTwoSided,
    clearSaved,
  } = useTrapTagStore();
  // Tags made from a file are not saved: the file is the record.
  const [bulk, setBulk] = useState<TrapTagCsvResult | null>(null);
  const [pdfState, setPdfState] = useState<'idle' | 'making' | 'failed'>('idle');
  const printRef = useRef<HTMLDivElement>(null);
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((state) => state.available);
  const storageDiscarded = useDiscardedSave(TRAP_TAG_STORAGE_KEY);
  const [ready, setReady] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<TrapTagFieldKey, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  // Both wordings, so the notice follows a later change of language.
  const [notice, setNotice] = useState<{ error: boolean; ja: string; en: string } | null>(null);
  // Set once the notice has announced that this browser refuses to store, so the standing line
  // does not repeat it. Reset by the next successful write.
  const [refusalSpoken, setRefusalSpoken] = useState(false);
  if (storageAvailable && refusalSpoken) setRefusalSpoken(false);
  const [summary, setSummary] = useState('');

  useEffect(() => {
    void Promise.all([useTrapTagStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
    // Only the switch is taken from another tab, never its input.
    const sync = (event: StorageEvent) => {
      if (event.key !== null && event.key !== TRAP_TAG_STORAGE_KEY) return;
      if (readSavedRemember(event.newValue) !== false) return;
      useTrapTagStore.setState({ remember: false });
      // setState writes through persist and would re-create a key another tab deleted.
      if (event.newValue === null) void useTrapTagStore.persist.clearStorage();
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const keys = TRAP_TAG_FIELDS[purpose];
  const activeBlanks = blanks.filter((key) => (keys as readonly string[]).includes(key));
  const sides = trapTagSides(purpose, twoSided);
  const validation = validateTrapTagFields(purpose, fields, activeBlanks);
  const sheetsFor = (values: Record<string, string>): { back: boolean; layout: TrapTagLayout }[] => {
    const front = sideValues(sides.front, values, activeBlanks);
    const sheets = [{ back: false, layout: getTrapTagLayout({ ...front, charSizeMm, copies }) }];
    if (sides.back.length > 0) {
      const back = sideValues(sides.back, values, activeBlanks);
      sheets.push({ back: true, layout: getTrapTagLayout({ ...back, charSizeMm, copies, mirror: true }) });
    }
    return sheets;
  };
  const formSheets = sheetsFor(fields);
  const layout = formSheets[0]!.layout;
  // Every side has to fit; the front is the one shown when both do not.
  const unfit = formSheets.find((sheet) => !sheet.layout.fits && sheet.layout.overflow !== 'empty');
  const allFit = formSheets.every((sheet) => sheet.layout.fits);
  const bulkRows = bulk?.ok ? bulk.rows : null;
  const bulkValid = bulkRows !== null && bulkRows.every((row) => Object.keys(row.errors).length === 0);
  const bulkSheets = bulkRows && bulkValid ? bulkRows.flatMap((row) => sheetsFor(row.fields)) : null;
  const bulkFit = bulkSheets?.every((sheet) => sheet.layout.fits) ?? false;
  const printSheets = bulkSheets ?? formSheets;
  const missing = keys.filter((key) => validation.errors[key] === 'required');
  const canPrint = bulkSheets ? bulkFit : validation.valid && allFit;
  const screenOnly = canPrint ? 'print:hidden' : undefined;
  const shownOverflow = unfit?.layout.overflow ?? layout.overflow;
  const overflowMessage =
    shownOverflow === 'height'
      ? t(
          'A4 に収まりません。一字の大きさを小さくするか、1 枚に並べる数を減らしてください（一字は法令上 10 mm 未満にできません）。',
          'Does not fit on A4. Choose a smaller character size or fewer tags per sheet (characters cannot be smaller than the legal 10 mm).',
        )
      : shownOverflow === 'width'
        ? t(
            '用紙の幅に 1 字も収まりません。1 枚に並べる数を減らすか、一字の大きさを小さくしてください。',
            'Not even one character fits across the sheet. Choose fewer tags per sheet or a smaller character size.',
          )
        : '';
  const tagSize = `${formatMillimetres(layout.tag.widthMm)} × ${formatMillimetres(layout.tag.heightMm)} mm`;
  const summaryMessage =
    ready && layout.lines.length > 0 && layout.fits
      ? t(
          `標識 1 枚は ${tagSize}。A4 に ${layout.copies} 枚並びます。`,
          `Each tag is ${tagSize}, ${layout.copies} per A4 sheet.`,
        )
      : '';

  // Announced once typing settles.
  useEffect(() => {
    const timer = setTimeout(() => setSummary(summaryMessage), 700);
    return () => clearTimeout(timer);
  }, [summaryMessage]);

  const fieldLabel = (key: TrapTagFieldKey) => {
    switch (key) {
      case 'address':
        return t('住所', 'Address');
      case 'name':
        return purpose === 'hunting' ? t('氏名', 'Name') : t('氏名又は名称', 'Name or organization name');
      case 'governor':
        return t(
          '狩猟者登録証に記載された都道府県知事名',
          'Prefectural governor named on the hunter registration card',
        );
      case 'fiscalYear':
        return t('登録年度', 'Registration fiscal year');
      case 'registrationNumber':
        return t('登録番号', 'Registration number');
      case 'authority':
        return t(
          '許可証に記載された環境大臣又は都道府県知事名',
          'Minister of the Environment or prefectural governor named on the permit',
        );
      case 'validPeriod':
        return t('許可の有効期間', 'Validity period of the permit');
      case 'permitNumber':
        return t('許可証の番号', 'Permit number');
      case 'species':
        return t(
          '捕獲等をしようとする鳥獣又は採取等をしようとする鳥類の卵の種類',
          'Species of wildlife to be captured, or of bird eggs to be collected',
        );
    }
  };

  const errorText = (error: TrapTagFieldError) =>
    error === 'tooLong'
      ? t(
          `${TRAP_TAG_MAX_FIELD_LENGTH} 文字以内で入力してください。`,
          `Use ${TRAP_TAG_MAX_FIELD_LENGTH} characters or fewer.`,
        )
      : t('入力してください。', 'Enter this item.');

  const changePurpose = (next: TrapTagPurpose) => {
    setPurpose(next);
    setTouched({});
    setSubmitted(false);
    setNotice(null);
  };

  // browserStorage swallows failed writes, so the outcome is read back before reporting it. A
  // removal passes its own result, as the status flag follows writes only.
  const reportStorage = (done: [string, string], failed: [string, string], outcome?: boolean) => {
    const writable = useStorageStatus.getState().available;
    const succeeded = outcome ?? writable;
    const [ja, en] = succeeded ? done : failed;
    setNotice({ error: !succeeded, ja, en });
    if (!succeeded && !writable) setRefusalSpoken(true);
  };

  // The delete also clears the form and cannot be undone.
  const confirmDelete = () =>
    !Object.values(fields).some((value) => value.trim()) ||
    window.confirm(
      t(
        '入力中の記載事項も消えます。保存した内容を削除しますか？',
        'This also clears the form. Delete the saved input?',
      ),
    );

  const noteFor = (back: boolean, size: number) =>
    back
      ? t(
          `裏面（長辺とじ）／50 mm の基準線／一字 ${size} mm／100% で印刷`,
          `Back (long-edge flip) / 50 mm reference line / ${size} mm characters / print at 100%`,
        )
      : t(
          `50 mm の基準線／一字 ${size} mm／100% で印刷`,
          `50 mm reference line / ${size} mm characters / print at 100%`,
        );

  const readFile = (file: File | undefined) => {
    if (!file) {
      setBulk(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setBulk(readTrapTagCsv(typeof reader.result === 'string' ? reader.result : '', purpose, activeBlanks));
    reader.onerror = () => setBulk({ ok: false, reason: 'empty' });
    reader.readAsText(file, 'utf-8');
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([trapTagCsvTemplate(purpose)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `trap-tags-${purpose}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadPdf = async () => {
    const svgs = Array.from(printRef.current?.querySelectorAll('svg') ?? []);
    if (svgs.length === 0) return;
    setPdfState('making');
    try {
      const pages = [];
      for (const svg of svgs) pages.push(await rasterizeSheet(svg, layout.page.widthMm, layout.page.heightMm));
      const pdf = buildImagePdf(pages, { width: layout.page.widthMm, height: layout.page.heightMm }, 'Trap tags');
      const url = URL.createObjectURL(new Blob([pdf as BlobPart], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'trap-tags.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setPdfState('idle');
    } catch {
      setPdfState('failed');
    }
  };

  const print = () => {
    if (bulkSheets) {
      if (bulkFit) window.print();
      else document.getElementById('trap-tag-char-size')?.focus();
      return;
    }
    setSubmitted(true);
    const firstInvalid = keys.find((key) => validation.errors[key]);
    if (firstInvalid) {
      document.getElementById(`trap-tag-${firstInvalid}`)?.focus();
      return;
    }
    if (!allFit) {
      document.getElementById('trap-tag-char-size')?.focus();
      return;
    }
    window.print();
  };

  return (
    <AppLayout
      header={
        <AppHeader
          className={screenOnly}
          title={labsTool('trap-tag').title[language]}
          actions={<LanguageMenu language={language} onLanguageChange={setLanguage} />}
        />
      }
    >
      {/* Live regions are mounted from the first paint; one inserted with its text is not announced.
          Each message has its own region because role="status" is atomic. */}
      <p className="sr-only" role="status" lang={language}>
        {storageDiscarded ? discardedSaveMessage(language) : ''}
      </p>
      <p className="sr-only" role="status" lang={language}>
        {summary}
      </p>
      {/* Announces a refusal to store until the notice under the switch has reported it. */}
      <p className="sr-only" role="status" lang={language}>
        {storageAvailable || refusalSpoken
          ? ''
          : t(
              'このブラウザーでは保存できません。ページを離れると入力は消えます。',
              'This browser cannot save. The input is lost when you leave the page.',
            )}
      </p>
      <div lang={language} className={cn('space-y-6', screenOnly)} inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={TRAP_TAG_STORAGE_KEY} language={language} />
        <ToolLayout
          resultLabel={t('プレビューと印刷', 'Preview and print')}
          primary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <div className="space-y-2">
                <h2 id="items" className="text-xl font-medium">
                  {t('記載事項', 'Items on the tag')}
                </h2>
                {language === 'en' && <p className="text-sm text-on-surface-variant">Enter the items in Japanese.</p>}
              </div>
              <SegmentedControl
                legend={t('用途', 'Purpose')}
                value={purpose}
                onChange={(value) => changePurpose(value as TrapTagPurpose)}
                options={(['hunting', 'permit', 'combined'] as const).map((value) => ({
                  value,
                  label:
                    value === 'hunting'
                      ? t('狩猟（網猟・わな猟の登録者）', 'Hunting (net or trap license holders)')
                      : value === 'permit'
                        ? t('許可捕獲（有害鳥獣捕獲等）', 'Capture under permit')
                        : t('共用（両方の記載事項を 1 枚に）', 'Combined (both sets of items on one tag)'),
                }))}
              />
              {purpose === 'combined' && (
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '共用の標識を使えるかは、登録・許可を受けた都道府県・市町村に確認してください。',
                    'Ask the prefecture or municipality that issued your registration or permit whether a combined tag is accepted.',
                  )}
                </p>
              )}
              {purpose !== 'hunting' && (
                <label className="flex min-h-12 cursor-pointer items-center gap-3 text-sm">
                  <input type="checkbox" checked={twoSided} onChange={(event) => setTwoSided(event.target.checked)} />
                  {t('両面に印刷する（鳥獣の種類を裏面へ）', 'Print on both sides (species on the back)')}
                </label>
              )}
              <div className="space-y-4">
                {keys.map((key) => {
                  const error = touched[key] || submitted ? validation.errors[key] : undefined;
                  return (
                    <div key={key} className="space-y-2">
                      <label htmlFor={`trap-tag-${key}`} className="block text-sm font-medium">
                        {fieldLabel(key)}
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-on-surface-variant">
                        <input type="checkbox" checked={blanks.includes(key)} onChange={() => toggleBlank(key)} />
                        {t('空欄で印刷（手書きする）', 'Leave blank to write by hand')}
                      </label>
                      <input
                        id={`trap-tag-${key}`}
                        type="text"
                        disabled={blanks.includes(key)}
                        value={fields[key]}
                        maxLength={TRAP_TAG_MAX_FIELD_LENGTH}
                        placeholder={t(`例：${FIELD_EXAMPLES[key]}`, `e.g. ${FIELD_EXAMPLES[key]}`)}
                        onChange={(event) => setField(key, event.target.value)}
                        onBlur={() => setTouched((state) => ({ ...state, [key]: true }))}
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? `trap-tag-${key}-error` : undefined}
                      />
                      {error && (
                        <p id={`trap-tag-${key}-error`} className="text-sm text-destructive">
                          {errorText(error)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="preview" className="text-xl font-medium">
                {t('プレビューと印刷', 'Preview and print')}
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <SelectField
                  fieldId="trap-tag-char-size"
                  label={t('一字の大きさ', 'Character size')}
                  value={String(charSizeMm)}
                  onChange={(value) => setCharSizeMm(Number(value) as TrapTagCharSizeMm)}
                  options={TRAP_TAG_CHAR_SIZES_MM.map((size) => ({ value: String(size), label: `${size} mm` }))}
                  hint={t(
                    '法令の下限は縦横 1.0 cm。字面で 1.0 cm にするなら 12 mm 以上。',
                    'The legal minimum is 1.0 cm each way. For the glyph itself to reach 1.0 cm, choose 12 mm or more.',
                  )}
                />
                <SelectField
                  fieldId="trap-tag-copies"
                  label={t('A4 1 枚に並べる数', 'Tags per A4 sheet')}
                  value={String(copies)}
                  onChange={(value) => setCopies(Number(value) as TrapTagCopies)}
                  options={TRAP_TAG_COPIES.map((count) => ({ value: String(count), label: String(count) }))}
                />
              </div>
              {layout.overflow === 'empty' ? (
                <p className="rounded-sm bg-surface-container p-4 text-sm">
                  {t('記載事項を入力してください。', 'Enter the items.')}
                </p>
              ) : overflowMessage ? (
                // Replaces the preview, whose tags would overlap.
                <p role="alert" className="rounded-sm bg-error-container p-4 text-sm text-on-error-container">
                  {overflowMessage}
                </p>
              ) : (
                formSheets.map((sheet) => (
                  <figure key={String(sheet.back)} className="space-y-2 rounded-sm bg-surface-container p-4">
                    <TrapTagSheet
                      layout={sheet.layout}
                      note={noteFor(sheet.back, sheet.layout.charSizeMm)}
                      label={
                        sheet.back
                          ? t('印刷する標識の裏面のプレビュー', 'Print preview of the back')
                          : t('印刷する標識のプレビュー', 'Print preview of the tags')
                      }
                      // Keeps the print button in view in the sticky column on a wide screen.
                      className="mx-auto max-h-[32rem] w-full drop-shadow-sm lg:max-h-80"
                    />
                    <figcaption className="text-center text-sm text-on-surface-variant">
                      {sheet.back
                        ? t(
                            '裏面（長辺とじで表と重なるよう左右を入れ替え）',
                            'Back, with columns swapped to line up with the front when flipped on the long edge',
                          )
                        : t(
                            `標識 1 枚 ${tagSize}、1 行 ${layout.maxCharsPerLine} 字で折り返し`,
                            `Each tag ${tagSize}, wrapped at ${layout.maxCharsPerLine} characters per line`,
                          )}
                    </figcaption>
                  </figure>
                ))
              )}
              {submitted && missing.length > 0 && (
                <div role="alert" className="rounded-sm bg-error-container p-4 text-sm text-on-error-container">
                  <p>{t('次の項目を入力してください。', 'Fill in these items.')}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {missing.map((key) => (
                      <li key={key}>{fieldLabel(key)}</li>
                    ))}
                  </ul>
                </div>
              )}
              <Button className="w-full" onClick={print}>
                <LuPrinter aria-hidden="true" />
                {bulkSheets
                  ? t(
                      `CSV の ${bulkRows?.length ?? 0} 人分を印刷する`,
                      `Print the ${bulkRows?.length ?? 0} sets from the CSV`,
                    )
                  : t('印刷する', 'Print')}
              </Button>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => void downloadPdf()}
                disabled={!canPrint || pdfState === 'making'}
              >
                <LuDownload aria-hidden="true" />
                {pdfState === 'making'
                  ? t('PDF を作成中…', 'Making the PDF…')
                  : t('実寸の PDF をダウンロード', 'Download a real-size PDF')}
              </Button>
              {pdfState === 'failed' && (
                <p role="alert" className="text-sm text-destructive">
                  {t(
                    'PDF を作成できませんでした。印刷ボタンを使ってください。',
                    'The PDF could not be made. Use the print button.',
                  )}
                </p>
              )}
              {twoSided && purpose !== 'hunting' && (
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '両面印刷は「長辺とじ」を選びます。片面ずつ印刷する場合は、表を印刷した紙を長辺で裏返して入れ直してください。',
                    'For two-sided printing choose flip on the long edge. Printing one side at a time, turn the printed sheet over on its long edge and feed it again.',
                  )}
                </p>
              )}
              <div className="space-y-2 text-sm text-on-surface-variant">
                <p>
                  {t(
                    '「実際のサイズ（100%）」を選び、「用紙に合わせる」とヘッダー・フッターをオフ、余白を「なし」にして印刷します。印刷後、基準線が 50 mm あるかと、印字された 1 字の大きさを定規で測ってください。',
                    'Print at Actual size (100%), with Fit to page and headers and footers off and margins set to none. After printing, check with a ruler that the reference line is 50 mm, and measure one printed character.',
                  )}
                </p>
                <p>
                  {t(
                    '標識は金属製又はプラスチック製と定められています。印刷した紙のままでは使えません。',
                    'The tag must be metal or plastic. The printed paper alone does not meet this.',
                  )}
                </p>
              </div>
            </Card>
          }
          secondary={
            <ConditionSection
              id="saving"
              title={t('この端末への保存', 'Saving on this device')}
              summary={
                !storageAvailable
                  ? t('このブラウザーでは保存できません。', 'This browser cannot save data.')
                  : remember
                    ? t('オン：入力内容をこのブラウザーに保存しています。', 'On: the input is saved in this browser.')
                    : t('オフ：保存していません。', 'Off: nothing is saved.')
              }
              // A failed save or delete stays visible.
              forceOpen={notice?.error === true}
            >
              <label className="flex min-h-12 cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => {
                    setRemember(event.target.checked);
                    if (event.target.checked) {
                      reportStorage(
                        ['この端末に保存しました。', 'Saved on this device.'],
                        [
                          'このブラウザーでは保存できませんでした。プライベートモードやサイトデータの設定を確認してください。',
                          'This browser could not save the input. Check private browsing and the site data settings.',
                        ],
                      );
                    } else {
                      reportStorage(
                        ['保存した内容を削除しました。', 'Saved input deleted.'],
                        [
                          '保存した内容を削除できなかった可能性があります。住所と氏名が残らないよう、ブラウザーの設定でこのサイトのデータを削除してください。',
                          'The saved input may not have been deleted. Delete this site’s data in your browser settings so your address and name are not left behind.',
                        ],
                      );
                    }
                  }}
                />
                {t('この端末に保存する', 'Save on this device')}
              </label>
              <p className="text-sm text-on-surface-variant">
                {t('オフにすると保存した内容を削除します。', 'Turning this off deletes the saved input.')}
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  if (!confirmDelete()) return;
                  const deleted = clearSaved();
                  setTouched({});
                  setSubmitted(false);
                  reportStorage(
                    ['保存した内容と入力を削除しました。', 'Saved input and form cleared.'],
                    [
                      '入力は消しましたが、保存した内容を削除できなかった可能性があります。ブラウザーの設定でこのサイトのデータを削除してください。',
                      'The form was cleared, but the saved input may not have been deleted. Delete this site’s data in your browser settings.',
                    ],
                    deleted,
                  );
                }}
              >
                <LuTrash2 aria-hidden="true" />
                {t('保存した内容を削除', 'Delete saved input')}
              </Button>
              {!storageAvailable && (
                <p className="text-sm">
                  {t(
                    'このブラウザーでは保存できません。ページを離れると入力は消えます。',
                    'This browser cannot save. The input is lost when you leave the page.',
                  )}
                </p>
              )}
              {/* Mounted empty from the start so its first message is announced. Urgency is set
                    by aria-live; when empty it is sr-only and takes no space. */}
              <p
                role="status"
                aria-live={notice?.error ? 'assertive' : 'polite'}
                className={notice ? `text-sm ${notice.error ? 'text-destructive' : ''}` : 'sr-only'}
              >
                {notice ? t(notice.ja, notice.en) : ''}
              </p>
            </ConditionSection>
          }
          extras={
            <>
              <ConditionSection
                id="csv"
                title={t('CSV からまとめて作る', 'Make several from a CSV')}
                summary={
                  bulkRows
                    ? t(`${bulkRows.length} 人分を読み込みました`, `${bulkRows.length} sets read`)
                    : t('猟友会・協議会などで複数人分を作るとき', 'For several people at once, such as a hunting club')
                }
                forceOpen={bulk !== null && !bulkValid}
              >
                <p className="text-sm text-on-surface-variant">
                  {t(
                    `いまの用途のひな形に 1 行 1 人で入力します（最大 ${TRAP_TAG_CSV_MAX_ROWS} 人分）。1 人分ずつ別の用紙に印刷します。空欄で印刷する項目の列は不要です。`,
                    `Fill in the template for the current purpose, one person per row (up to ${TRAP_TAG_CSV_MAX_ROWS}). Each person is printed on their own sheet. Columns for items left blank can be left out.`,
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={downloadTemplate}>
                    <LuFileText aria-hidden="true" />
                    {t('ひな形（CSV）をダウンロード', 'Download the template (CSV)')}
                  </Button>
                  {bulk && (
                    <Button variant="ghost" onClick={() => setBulk(null)}>
                      {t('読み込みをやめる', 'Stop using the file')}
                    </Button>
                  )}
                </div>
                <div className="space-y-1">
                  <label htmlFor="trap-tag-csv" className="block text-sm font-medium">
                    {t('CSV ファイル', 'CSV file')}
                  </label>
                  <input
                    id="trap-tag-csv"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => readFile(event.target.files?.[0])}
                    className="block text-sm"
                  />
                </div>
                {bulk && !bulk.ok && (
                  <p role="alert" className="text-sm text-destructive">
                    {bulk.reason === 'empty'
                      ? t('見出しと 1 行以上のデータが必要です。', 'The file needs a header and at least one row.')
                      : bulk.reason === 'tooMany'
                        ? t(`${TRAP_TAG_CSV_MAX_ROWS} 人分までです。`, `Up to ${TRAP_TAG_CSV_MAX_ROWS} rows.`)
                        : t(
                            `次の列がありません：${bulk.missing?.join('、')}`,
                            `Missing columns: ${bulk.missing?.join(', ')}`,
                          )}
                  </p>
                )}
                {bulkRows && !bulkValid && (
                  <div role="alert" className="text-sm text-destructive">
                    <p>{t('次の行を直してください。', 'Correct these rows.')}</p>
                    <ul className="mt-1 list-disc pl-5">
                      {bulkRows
                        .filter((row) => Object.keys(row.errors).length > 0)
                        .map((row) => (
                          <li key={row.line}>
                            {t(`${row.line} 行目：`, `Line ${row.line}: `)}
                            {Object.entries(row.errors)
                              .map(
                                ([key, error]) =>
                                  `${TRAP_TAG_CSV_HEADERS[key as TrapTagFieldKey]}（${error === 'tooLong' ? t('長すぎます', 'too long') : t('空欄', 'empty')}）`,
                              )
                              .join('、')}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
                {bulkSheets && !bulkFit && (
                  <p role="alert" className="text-sm text-destructive">
                    {t(
                      'A4 に収まらない人がいます。一字の大きさか 1 枚に並べる数を減らしてください。',
                      'Some sets do not fit on A4. Choose a smaller character size or fewer tags per sheet.',
                    )}
                  </p>
                )}
              </ConditionSection>
              <ConditionSection
                id="legal"
                title={t('法令の定め', 'What the law requires')}
                summary={
                  purpose === 'hunting'
                    ? t('法第 62 条第 3 項・施行規則第 70 条', 'Act art. 62(3) and Regulation art. 70')
                    : purpose === 'permit'
                      ? t('法第 9 条第 12 項・施行規則第 7 条', 'Act art. 9(12) and Regulation art. 7')
                      : t(
                          '法第 9 条第 12 項・第 62 条第 3 項、施行規則第 7 条・第 70 条',
                          'Act art. 9(12) and 62(3), Regulation art. 7 and 70',
                        )
                }
              >
                {(purpose === 'combined' ? (['permit', 'hunting'] as const) : [purpose]).map((kind) => (
                  <section key={kind} className="space-y-3 text-sm">
                    <h3 className="font-medium">
                      {kind === 'hunting'
                        ? t('狩猟（網猟・わな猟の登録者）', 'Hunting (net or trap license holders)')
                        : t('許可捕獲（有害鳥獣捕獲等）', 'Capture under permit')}
                    </h3>
                    <p className="text-on-surface-variant">
                      {kind === 'hunting'
                        ? t(
                            '鳥獣の保護及び管理並びに狩猟の適正化に関する法律 第 62 条第 3 項、同法施行規則 第 70 条',
                            'Japanese text of Article 62(3) of the Wildlife Protection, Control and Hunting Management Act and Article 70 of its Enforcement Regulation.',
                          )
                        : t(
                            '鳥獣の保護及び管理並びに狩猟の適正化に関する法律 第 9 条第 12 項、同法施行規則 第 7 条第 16 項〜第 18 項',
                            'Japanese text of Article 9(12) of the Wildlife Protection, Control and Hunting Management Act and Article 7(16)–(18) of its Enforcement Regulation.',
                          )}
                    </p>
                    <blockquote
                      lang="ja"
                      className="space-y-2 border-l-4 border-outline-variant pl-4 text-on-surface-variant"
                    >
                      {kind === 'hunting' ? (
                        <>
                          <p>
                            第六十二条第三項　網猟免許又はわな猟免許に係る狩猟者登録を受けた者は、狩猟をするときは、その使用する猟具ごとに、見やすい場所に、住所、氏名その他環境省令で定める事項を表示しなければならない。
                          </p>
                          <p>
                            第七十条　法第六十二条第三項の環境省令で定める事項は、狩猟者登録証に記載された都道府県知事名、登録年度及び登録番号とする。
                          </p>
                          <p>
                            ２　前項の事項は、金属製又はプラスチック製の標識に、一字の大きさが縦一・〇センチメートル以上、横一・〇センチメートル以上の文字で記載しなければならない。
                          </p>
                        </>
                      ) : (
                        <>
                          <p>
                            第九条第十二項　第一項の許可を受けた者又は従事者は、捕獲等をするときは、その使用する猟具（環境省令で定めるものに限る。）ごとに、見やすい場所に、住所及び氏名又は名称その他環境省令で定める事項を表示しなければならない。
                          </p>
                          <p>
                            第七条第十六項　法第九条第十二項の環境省令で定める猟具は、網、わな及びつりばり又はとりもちを使用した猟具とする。
                          </p>
                          <p>
                            １７　法第九条第十二項の環境省令で定める事項は、許可証に記載された環境大臣又は都道府県知事名、許可の有効期間、許可証の番号及び捕獲等をしようとする鳥獣又は採取等をしようとする鳥類の卵の種類とする。
                          </p>
                          <p>
                            １８　前項の事項は、金属製又はプラスチック製の標識に、一字の大きさが縦一・〇センチメートル以上、横一・〇センチメートル以上の文字で記載しなければならない。
                          </p>
                        </>
                      )}
                    </blockquote>
                    <p className="flex flex-wrap gap-x-4 gap-y-2">
                      <a href={LAW_URL} target="_blank" rel="noreferrer">
                        {t('法（e-Gov 法令検索）', 'The Act (e-Gov)')}
                      </a>
                      <a href={REGULATION_URL} target="_blank" rel="noreferrer">
                        {t('施行規則（e-Gov 法令検索）', 'The Enforcement Regulation (e-Gov)')}
                      </a>
                    </p>
                  </section>
                ))}
                <p className="text-sm text-on-surface-variant">
                  {t('標識全体の寸法は定められていません。', 'The overall size of the tag is not specified.')}
                </p>
              </ConditionSection>
            </>
          }
        />
      </div>
      {canPrint && (
        <div className={styles.sheets} ref={printRef}>
          {printSheets.map((sheet, index) => (
            <div key={index} className={styles.page}>
              <TrapTagSheet
                layout={sheet.layout}
                note={noteFor(sheet.back, sheet.layout.charSizeMm)}
                actualSize
                className="block"
              />
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
