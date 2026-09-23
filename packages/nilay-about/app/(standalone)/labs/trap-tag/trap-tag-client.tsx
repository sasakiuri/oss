'use client';

import { useEffect, useState } from 'react';
import { LuPrinter, LuTrash2 } from 'react-icons/lu';

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
  getTrapTagPrintValues,
  type TrapTagCharSizeMm,
  type TrapTagCopies,
} from '@/lib/trap-tag';
import { cn } from '@/lib/utils';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { TRAP_TAG_STORAGE_KEY, readSavedRemember, useTrapTagStore } from './_store';
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
    setPurpose,
    setCharSizeMm,
    setCopies,
    setRemember,
    setField,
    clearSaved,
  } = useTrapTagStore();
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
  const validation = validateTrapTagFields(purpose, fields);
  const layout = getTrapTagLayout({ values: getTrapTagPrintValues(purpose, fields), charSizeMm, copies });
  const missing = keys.filter((key) => validation.errors[key] === 'required');
  const canPrint = validation.valid && layout.fits;
  const screenOnly = canPrint ? 'print:hidden' : undefined;
  const overflowMessage =
    layout.overflow === 'height'
      ? t(
          'A4 に収まりません。一字の大きさを小さくするか、1 枚に並べる数を減らしてください（一字は法令上 10 mm 未満にできません）。',
          'Does not fit on A4. Choose a smaller character size or fewer tags per sheet (characters cannot be smaller than the legal 10 mm).',
        )
      : layout.overflow === 'width'
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

  const print = () => {
    setSubmitted(true);
    const firstInvalid = keys.find((key) => validation.errors[key]);
    if (firstInvalid) {
      document.getElementById(`trap-tag-${firstInvalid}`)?.focus();
      return;
    }
    if (!layout.fits) {
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
                {language === 'en' && (
                  <p className="text-sm text-on-surface-variant">
                    Enter the items in Japanese. They are printed in this order.
                  </p>
                )}
              </div>
              <SegmentedControl
                legend={t('用途', 'Purpose')}
                value={purpose}
                onChange={(value) => changePurpose(value as TrapTagPurpose)}
                options={(['hunting', 'permit'] as const).map((value) => ({
                  value,
                  label:
                    value === 'hunting'
                      ? t('狩猟（網猟・わな猟の登録者）', 'Hunting (net or trap license holders)')
                      : t('許可捕獲（有害鳥獣捕獲等）', 'Capture under permit'),
                }))}
              />
              <div className="space-y-4">
                {keys.map((key) => {
                  const error = touched[key] || submitted ? validation.errors[key] : undefined;
                  return (
                    <div key={key} className="space-y-2">
                      <label htmlFor={`trap-tag-${key}`} className="block text-sm font-medium">
                        {fieldLabel(key)}
                      </label>
                      <input
                        id={`trap-tag-${key}`}
                        type="text"
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
                    '文字の枠の大きさ。法令の下限は縦横 1.0 cm。字面で 1.0 cm にするなら 12 mm 以上。',
                    'Size of the character box. The legal minimum is 1.0 cm high and wide; choose 12 mm or more for the glyph itself to reach 1.0 cm.',
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
                <figure className="space-y-2 rounded-sm bg-surface-container p-4">
                  <TrapTagSheet
                    layout={layout}
                    note={t(
                      `50 mm の基準線／一字 ${layout.charSizeMm} mm／100% で印刷`,
                      `50 mm reference line / ${layout.charSizeMm} mm characters / print at 100%`,
                    )}
                    label={t('印刷する標識のプレビュー', 'Print preview of the tags')}
                    // Keeps the print button in view in the sticky column on a wide screen.
                    className="mx-auto max-h-[32rem] w-full drop-shadow-sm lg:max-h-80"
                  />
                  <figcaption className="text-center text-sm text-on-surface-variant">
                    {t(
                      `標識 1 枚 ${tagSize}、1 行 ${layout.maxCharsPerLine} 字で折り返し。画面上は実寸ではありません。`,
                      `Each tag ${tagSize}, wrapped at ${layout.maxCharsPerLine} characters per line. Not actual size on screen.`,
                    )}
                  </figcaption>
                </figure>
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
                {t('印刷する', 'Print')}
              </Button>
              <div className="space-y-2 text-sm text-on-surface-variant">
                <p>
                  {t(
                    '「実際のサイズ（100%）」を選び、「用紙に合わせる」とヘッダー・フッターをオフ、余白を「なし」にして印刷します。印刷後、基準線が 50 mm あるかと、印字された 1 字の大きさを定規で測ってください。字面の大きさは書体によって変わります。',
                    'Print at Actual size (100%), with Fit to page and headers and footers off and margins set to none. After printing, check with a ruler that the reference line is 50 mm, and measure one printed character. The visible glyph size depends on the typeface.',
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
                    : t(
                        'オフ：住所と氏名を含むため、既定では保存しません。',
                        'Off by default, as the items include an address and a name.',
                      )
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
                {t(
                  '入力は外部に送信しません。オフにすると保存した内容を削除します。',
                  'Nothing is sent anywhere. Turning this off deletes the saved input.',
                )}
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
            <ConditionSection
              id="legal"
              title={t('法令の定め', 'What the law requires')}
              summary={
                purpose === 'hunting'
                  ? t('法第 62 条第 3 項・施行規則第 70 条', 'Act art. 62(3) and Regulation art. 70')
                  : t('法第 9 条第 12 項・施行規則第 7 条', 'Act art. 9(12) and Regulation art. 7')
              }
            >
              <section className="space-y-3 text-sm">
                <h3 className="font-medium">
                  {purpose === 'hunting'
                    ? t('狩猟（網猟・わな猟の登録者）', 'Hunting (net or trap license holders)')
                    : t('許可捕獲（有害鳥獣捕獲等）', 'Capture under permit')}
                </h3>
                <p className="text-on-surface-variant">
                  {purpose === 'hunting'
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
                  {purpose === 'hunting' ? (
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
              <ul className="list-disc space-y-2 pl-5 text-sm text-on-surface-variant">
                <li>{t('標識全体の寸法は定められていません。', 'The overall size of the tag is not specified.')}</li>
                <li>
                  {t(
                    '登録・許可を受けた都道府県の案内も確認してください。',
                    'Also check the guidance of the prefecture that issued your registration or permit.',
                  )}
                </li>
              </ul>
            </ConditionSection>
          }
        />
      </div>
      {canPrint && (
        <div className={styles.sheet}>
          <TrapTagSheet
            layout={layout}
            note={t(
              `50 mm の基準線／一字 ${layout.charSizeMm} mm／100% で印刷`,
              `50 mm reference line / ${layout.charSizeMm} mm characters / print at 100%`,
            )}
            actualSize
            className="block"
          />
        </div>
      )}
    </AppLayout>
  );
}
