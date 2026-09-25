'use client';

import { useEffect, useState } from 'react';
import { LuPencil, LuPlus, LuPrinter, LuTrash2, LuX } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  LanguageMenu,
  PhotoAttachments,
  ResetButton,
  ResultFigure,
  ResultPanel,
  SelectField,
  ToolLayout,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import {
  GUN_KIND_LABELS,
  LICENSE_LABELS,
  buildReportDraft,
  describeCatches,
  compareOutings,
  createOutingId,
  draftOfOuting,
  emptyOutingDraft,
  formatJapaneseDate,
  outingsOutsideRegistration,
  parseOutingDraft,
  reportGroupKey,
  reportGroups,
  isRegistrationDateInRange,
  registrationDateRange,
  REPORT_DEADLINE_GUIDE,
  type CatchError,
  type OutingDraft,
  type OutingDraftError,
  type OutingDraftField,
} from '@/lib/hunting-log';
import { labsTool } from '@/lib/labs-tools';
import { savedAsShown } from '@/lib/persisted-store';
import { deletePhotosOf, deleteToolPhotos } from '@/lib/photo-storage';
import {
  GAME_SPECIES,
  HUNTING_LOG_MAX_COUNT,
  HUNTING_LOG_MAX_NOTE,
  HUNTING_LOG_MAX_TEXT,
  LICENSE_TYPES,
  PREFECTURES,
  type GameSpecies,
  type GunKind,
  type LicenseType,
  type Prefecture,
} from '@/lib/schemas/hunting-log';
import { cn } from '@/lib/utils';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { HUNTING_LOG_STORAGE_KEY, useHuntingLogStore } from './_store';
import styles from './hunting-log-print.module.css';
import { HuntingLogReport } from './hunting-log-report';

export const LAW_URL = 'https://laws.e-gov.go.jp/law/414AC0000000088';
export const REGULATION_URL = 'https://laws.e-gov.go.jp/law/414M60001000028';
export const CIVIL_CODE_URL = 'https://laws.e-gov.go.jp/law/129AC0000000089';
export const CHECKED_ON = '2026年9月23日';

/** Today on the reader's own calendar, not in UTC: an outing at 7 a.m. in Japan is still today. */
function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function HuntingLogClient() {
  const {
    outings,
    prefecture: lastPrefecture,
    registrationDates,
    saveOuting,
    removeOuting,
    setRegistrationDate,
    clearAll,
  } = useHuntingLogStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((state) => state.available);
  const storageDiscarded = useDiscardedSave(HUNTING_LOG_STORAGE_KEY);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<OutingDraft>(() => emptyOutingDraft('', null));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // Both wordings, so a notice raised before the language changes follows it.
  const [notice, setNotice] = useState<{ ja: string; en: string } | null>(null);

  useEffect(() => {
    void Promise.all([useHuntingLogStore.persist.rehydrate(), rehydrateLanguage()]).then(() => {
      setDraft(emptyOutingDraft(localToday(), useHuntingLogStore.getState().prefecture));
      setReady(true);
    });
    // Pick up records added in another tab, so neither tab overwrites the other's list.
    const sync = (event: StorageEvent) => {
      if (event.key !== null && event.key !== HUNTING_LOG_STORAGE_KEY) return;
      void useHuntingLogStore.persist.rehydrate();
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const parsed = parseOutingDraft(draft, editingId ?? 'draft');
  const groups = reportGroups(outings);
  const selected = groups.find((group) => reportGroupKey(group) === selectedKey) ?? groups[0];
  const selectedKeyResolved = selected ? reportGroupKey(selected) : null;
  const registeredOn = selectedKeyResolved ? (registrationDates[selectedKeyResolved] ?? null) : null;
  const report = selected ? buildReportDraft(outings, selected, registeredOn) : null;
  const outside = outingsOutsideRegistration(outings);
  const outsideIds = new Set(outside.map((outing) => outing.id));
  const beforeRegistrationIds = new Set(report?.beforeRegistration.map((outing) => outing.id) ?? []);
  // The typed day stays in the field while it is being edited; only a day inside the season is stored.
  const [registrationInput, setRegistrationInput] = useState<{ key: string | null; value: string }>({
    key: null,
    value: '',
  });
  const registrationValue =
    registrationInput.key === selectedKeyResolved ? registrationInput.value : (registeredOn ?? '');
  const registrationInvalid =
    selected !== undefined &&
    registrationValue !== '' &&
    !isRegistrationDateInRange(registrationValue, selected.season);
  const listed = [...outings].sort((a, b) => compareOutings(b, a));
  const total = report ? report.totals.reduce((sum, item) => sum + item.count, 0) : 0;

  const update = (changes: Partial<OutingDraft>) => setDraft((current) => ({ ...current, ...changes }));
  const updateCatch = (index: number, changes: Partial<OutingDraft['catches'][number]>) =>
    setDraft((current) => ({
      ...current,
      catches: current.catches.map((item, position) => (position === index ? { ...item, ...changes } : item)),
    }));

  const fieldError = (field: OutingDraftField) => (submitted ? parsed.errors[field] : undefined);
  const errorText = (error: OutingDraftError, field: OutingDraftField) => {
    if (error === 'tooLong') {
      const max = field === 'note' ? HUNTING_LOG_MAX_NOTE : HUNTING_LOG_MAX_TEXT;
      return t(`${max} 文字以内で入力してください。`, `Use ${max} characters or fewer.`);
    }
    if (error === 'invalid') return t('日付を正しく入力してください。', 'Enter a valid date.');
    return t('入力してください。', 'Required.');
  };
  const catchErrorText = (error: CatchError) =>
    error === 'species'
      ? t('鳥獣の種類を選んでください。', 'Choose the species.')
      : error === 'gun'
        ? t('装薬銃か空気銃かを選んでください。', 'Choose a cartridge gun or an air gun.')
        : error === 'duplicate'
          ? t(
              '同じ鳥獣（同じ銃）が 2 行あります。1 行にまとめてください。',
              'This species and gun are listed twice. Combine them into one line.',
            )
          : t(
              `1 から ${HUNTING_LOG_MAX_COUNT} までの整数で入力してください。`,
              `Enter a whole number from 1 to ${HUNTING_LOG_MAX_COUNT}.`,
            );

  const resetForm = (prefecture: Prefecture | null) => {
    setDraft(emptyOutingDraft(localToday(), prefecture));
    setEditingId(null);
    setSubmitted(false);
  };

  const submit = () => {
    setSubmitted(true);
    if (!parsed.outing) {
      const first = (['date', 'prefecture', 'license', 'municipality', 'mesh', 'note'] as const).find(
        (field) => parsed.errors[field],
      );
      const firstCatch = parsed.catchErrors.findIndex(Boolean);
      const catchError = parsed.catchErrors[firstCatch];
      // The field that is wrong, not the first field of its line.
      const catchField = catchError === 'count' ? 'count' : catchError === 'gun' ? 'gun' : 'species';
      document
        .getElementById(first ? `hunting-log-${first}` : `hunting-log-catch-${firstCatch}-${catchField}`)
        ?.focus();
      return;
    }
    const outing = { ...parsed.outing, id: editingId ?? createOutingId() };
    saveOuting(outing);
    const date = formatJapaneseDate(outing.date);
    setNotice(
      editingId
        ? { ja: `${date}の記録を更新しました。`, en: `Record for ${outing.date} updated.` }
        : { ja: `${date}の出猟を記録しました。`, en: `Outing on ${outing.date} recorded.` },
    );
    setSelectedKey(null);
    resetForm(outing.prefecture);
  };

  const remove = (id: string, date: string) => {
    if (
      !window.confirm(
        t(`${formatJapaneseDate(date)}の記録を削除しますか？`, `Delete the record for ${date}? This cannot be undone.`),
      )
    )
      return;
    removeOuting(id);
    if (editingId === id) resetForm(lastPrefecture);
    // The record's photos go with it, but only once its removal is on disk: a record that failed to
    // save comes back on the next visit, and its photos must still be there with it.
    if (!savedAsShown(useHuntingLogStore)) {
      setNotice({
        ja: `${formatJapaneseDate(date)}の記録を削除できなかった可能性があります。写真は残しています。`,
        en: `The record for ${date} may not have been deleted. Its photos are kept.`,
      });
      return;
    }
    setNotice({ ja: `${formatJapaneseDate(date)}の記録を削除しました。`, en: `Record for ${date} deleted.` });
    deletePhotosOf('hunting-log', id).catch(() =>
      setNotice({
        ja: `${formatJapaneseDate(date)}の記録を削除しましたが、写真を削除できませんでした。`,
        en: `Record for ${date} deleted, but its photos could not be deleted.`,
      }),
    );
  };

  const edit = (id: string) => {
    const outing = outings.find((item) => item.id === id);
    if (!outing) return;
    setDraft(draftOfOuting(outing));
    setEditingId(id);
    setSubmitted(false);
    document.getElementById('hunting-log-date')?.focus();
  };

  const licenseLabel = (license: LicenseType) => LICENSE_LABELS[license];
  const withoutMeshWarning =
    report && report.withoutMesh > 0
      ? t(
          `捕獲のあった記録のうち ${report.withoutMesh} 件にメッシュ番号がありません。捕獲場所の欄には、都道府県が示す図面のメッシュ番号等を記載します（様式第十七 備考 7）。`,
          `${report.withoutMesh} record(s) with game taken have no mesh number. The place column takes the mesh number from the prefecture's map (Form 17, note 7).`,
        )
      : '';

  return (
    <AppLayout
      header={
        <AppHeader
          className="print:hidden"
          title={labsTool('hunting-log').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: 'この端末に保存した出猟の記録と写真をすべて削除します。元に戻せません。',
                  en: 'Deletes every outing and photo saved on this device. This cannot be undone.',
                }}
                onReset={() => {
                  clearAll();
                  resetForm(null);
                  if (!savedAsShown(useHuntingLogStore)) {
                    setNotice({
                      ja: '記録を削除できなかった可能性があります。写真は残しています。',
                      en: 'The records may not have been deleted. The photos are kept.',
                    });
                    return;
                  }
                  setNotice({ ja: '記録をすべて削除しました。', en: 'All records deleted.' });
                  deleteToolPhotos('hunting-log').catch(() =>
                    setNotice({
                      ja: '記録をすべて削除しましたが、写真を削除できませんでした。',
                      en: 'All records deleted, but the photos could not be deleted.',
                    }),
                  );
                }}
              />
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
            </>
          }
        />
      }
    >
      {/* Mounted from the first paint, so a message set later is announced. */}
      <p className="sr-only" role="status" lang={language}>
        {storageDiscarded
          ? t(
              '保存されていた出猟の記録を読み取れなかったため、記録のない状態で開いています。',
              'The saved hunting log could not be read, so this opened with no records.',
            )
          : ''}
      </p>
      <p className="sr-only" role="status" lang={language}>
        {notice ? t(notice.ja, notice.en) : ''}
      </p>
      <div lang={language} className="space-y-6 print:hidden" inert={!ready} aria-busy={!ready}>
        {storageDiscarded && (
          <p className="rounded-sm bg-error-container p-4 text-sm text-on-error-container">
            {t(
              '保存されていた出猟の記録を読み取れなかったため、記録のない状態で開いています。',
              'The saved hunting log could not be read, so this opened with no records.',
            )}
          </p>
        )}
        {!storageAvailable && (
          <p className="rounded-sm bg-error-container p-4 text-sm text-on-error-container">
            {t(
              'このブラウザーでは保存できません。ページを離れると記録は消えます。',
              'This browser cannot save. The log is lost when you leave the page.',
            )}
          </p>
        )}
        {language === 'en' && (
          <p className="text-sm text-on-surface-variant">
            The report, species and licence names are shown in Japanese, as on the form.
          </p>
        )}
        <ToolLayout
          resultLabel={t('報告の下書き', 'Report draft')}
          primary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <div className="space-y-2">
                <h2 id="record" className="text-xl font-medium">
                  {editingId ? t('記録を直す', 'Edit record') : t('出猟を記録', 'Record an outing')}
                </h2>
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '出猟日ごとに 1 件。捕獲なしの日も記録します。',
                    'One record per day out, including days with nothing taken.',
                  )}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="hunting-log-date" className="block text-sm font-medium">
                    {t('出猟日', 'Date')}
                  </label>
                  <input
                    id="hunting-log-date"
                    type="date"
                    className="min-h-12 w-full rounded-sm border border-outline bg-surface p-3 text-on-surface"
                    value={draft.date}
                    onChange={(event) => update({ date: event.target.value })}
                    aria-invalid={Boolean(fieldError('date'))}
                    aria-describedby={fieldError('date') ? 'hunting-log-date-error' : undefined}
                  />
                  {fieldError('date') && (
                    <p id="hunting-log-date-error" className="text-sm text-destructive">
                      {errorText(fieldError('date')!, 'date')}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <label htmlFor="hunting-log-prefecture" className="block text-sm font-medium">
                    {t('都道府県（狩猟者登録を受けたところ）', 'Prefecture of registration')}
                  </label>
                  <select
                    id="hunting-log-prefecture"
                    value={draft.prefecture}
                    onChange={(event) => update({ prefecture: event.target.value as Prefecture | '' })}
                    aria-invalid={Boolean(fieldError('prefecture'))}
                    aria-describedby={fieldError('prefecture') ? 'hunting-log-prefecture-error' : undefined}
                  >
                    <option value="">{t('選んでください', 'Choose')}</option>
                    {PREFECTURES.map((name) => (
                      <option key={name} value={name} lang="ja">
                        {name}
                      </option>
                    ))}
                  </select>
                  {fieldError('prefecture') && (
                    <p id="hunting-log-prefecture-error" className="text-sm text-destructive">
                      {errorText(fieldError('prefecture')!, 'prefecture')}
                    </p>
                  )}
                </div>
                {(['municipality', 'mesh'] as const).map((field) => (
                  <div key={field} className="space-y-2">
                    <label htmlFor={`hunting-log-${field}`} className="block text-sm font-medium">
                      {field === 'municipality' ? t('市町村', 'Municipality') : t('メッシュ番号等', 'Mesh number')}
                    </label>
                    <input
                      id={`hunting-log-${field}`}
                      type="text"
                      value={draft[field]}
                      maxLength={HUNTING_LOG_MAX_TEXT}
                      placeholder={field === 'municipality' ? t('例：○○市', 'e.g. ○○市') : t('例：123', 'e.g. 123')}
                      onChange={(event) => update({ [field]: event.target.value })}
                      aria-invalid={Boolean(fieldError(field))}
                      aria-describedby={`hunting-log-${field}-hint${fieldError(field) ? ` hunting-log-${field}-error` : ''}`}
                    />
                    <p id={`hunting-log-${field}-hint`} className="text-xs text-on-surface-variant">
                      {field === 'municipality'
                        ? t(
                            'メッシュ番号がないときの捕獲場所になります。',
                            'The report’s place when there is no mesh number.',
                          )
                        : t(
                            '都道府県の鳥獣保護区等位置図に載っている番号。',
                            'From the prefecture’s protected-area map.',
                          )}
                    </p>
                    {fieldError(field) && (
                      <p id={`hunting-log-${field}-error`} className="text-sm text-destructive">
                        {errorText(fieldError(field)!, field)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <label htmlFor="hunting-log-license" className="block text-sm font-medium">
                  {t('猟法（免許の種類）', 'Method (licence type)')}
                </label>
                <select
                  id="hunting-log-license"
                  value={draft.license}
                  onChange={(event) => {
                    const license = event.target.value as LicenseType | '';
                    // The gun is asked only for a first-class gun licence, line by line.
                    update({
                      license,
                      catches: draft.catches.map((item) => ({
                        ...item,
                        gun: license === 'firstGun' ? item.gun : null,
                      })),
                    });
                  }}
                  aria-invalid={Boolean(fieldError('license'))}
                  aria-describedby={fieldError('license') ? 'hunting-log-license-error' : undefined}
                >
                  <option value="">{t('選んでください', 'Choose')}</option>
                  {LICENSE_TYPES.map((license) => (
                    <option key={license} value={license} lang="ja">
                      {licenseLabel(license)}
                    </option>
                  ))}
                </select>
                {fieldError('license') && (
                  <p id="hunting-log-license-error" className="text-sm text-destructive">
                    {errorText(fieldError('license')!, 'license')}
                  </p>
                )}
              </div>
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">{t('捕獲した鳥獣', 'Game taken')}</legend>
                {draft.license === 'firstGun' && (
                  <p className="text-xs text-on-surface-variant">
                    {t(
                      '行ごとに使った銃を選びます。両方で捕獲がある年度は、報告を銃ごとに分けます（様式第十七 備考 6）。',
                      'Choose the gun for each line. If a season has takes with both, the report is split by gun (Form 17, note 6).',
                    )}
                  </p>
                )}
                {draft.catches.length === 0 && (
                  <p className="text-sm text-on-surface-variant">{t('捕獲なし', 'Nothing taken')}</p>
                )}
                {draft.catches.map((item, index) => {
                  const error = submitted ? parsed.catchErrors[index] : null;
                  const base = `hunting-log-catch-${index}`;
                  return (
                    <div key={index} className="space-y-1">
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="min-w-[12rem] flex-1 space-y-1">
                          <label htmlFor={`${base}-species`} className="block text-xs">
                            {t(`鳥獣の種類 ${index + 1}`, `Species ${index + 1}`)}
                          </label>
                          <select
                            id={`${base}-species`}
                            value={item.species}
                            onChange={(event) => updateCatch(index, { species: event.target.value as GameSpecies })}
                            aria-invalid={error === 'species' || error === 'duplicate'}
                            aria-describedby={error ? `${base}-error` : undefined}
                          >
                            <option value="">{t('選んでください', 'Choose')}</option>
                            {(['bird', 'mammal'] as const).map((group) => (
                              <optgroup key={group} label={group === 'bird' ? '鳥類' : '獣類'}>
                                {GAME_SPECIES.filter((species) => species.group === group).map((species) => (
                                  <option key={species.name} value={species.name} lang="ja">
                                    {'qualifier' in species ? `${species.name}（${species.qualifier}）` : species.name}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </div>
                        <div className="w-24 space-y-1">
                          <label htmlFor={`${base}-count`} className="block text-xs">
                            {t('数', 'Count')}
                          </label>
                          <input
                            id={`${base}-count`}
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={HUNTING_LOG_MAX_COUNT}
                            step={1}
                            value={Number.isFinite(item.count) ? item.count : ''}
                            onChange={(event) =>
                              updateCatch(index, {
                                count: event.target.value === '' ? NaN : Number(event.target.value),
                              })
                            }
                            aria-invalid={error === 'count'}
                            aria-describedby={error ? `${base}-error` : undefined}
                          />
                        </div>
                        {draft.license === 'firstGun' && (
                          <div className="w-28 space-y-1">
                            <label htmlFor={`${base}-gun`} className="block text-xs">
                              {t(`銃 ${index + 1}`, `Gun ${index + 1}`)}
                            </label>
                            <select
                              id={`${base}-gun`}
                              value={item.gun ?? ''}
                              onChange={(event) =>
                                updateCatch(index, { gun: (event.target.value || null) as GunKind | null })
                              }
                              aria-invalid={error === 'gun' || error === 'duplicate'}
                              aria-describedby={error ? `${base}-error` : undefined}
                            >
                              <option value="">{t('選ぶ', 'Choose')}</option>
                              {(['powder', 'air'] as const).map((gun) => (
                                <option key={gun} value={gun} lang="ja">
                                  {GUN_KIND_LABELS[gun]}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t(`鳥獣 ${index + 1} を外す`, `Remove species ${index + 1}`)}
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              catches: current.catches.filter((_, position) => position !== index),
                            }))
                          }
                        >
                          <LuX aria-hidden="true" />
                        </Button>
                      </div>
                      {error && (
                        <p id={`${base}-error`} className="text-sm text-destructive">
                          {catchErrorText(error)}
                        </p>
                      )}
                    </div>
                  );
                })}
                <Button
                  variant="outline"
                  disabled={draft.catches.length >= GAME_SPECIES.length * 2}
                  onClick={() => update({ catches: [...draft.catches, { species: '', count: 1, gun: null }] })}
                >
                  <LuPlus aria-hidden="true" />
                  {t('鳥獣を追加', 'Add game')}
                </Button>
              </fieldset>
              <div className="space-y-2">
                <label htmlFor="hunting-log-note" className="block text-sm font-medium">
                  {t('メモ', 'Note')}
                </label>
                <textarea
                  id="hunting-log-note"
                  rows={2}
                  className="w-full"
                  value={draft.note}
                  maxLength={HUNTING_LOG_MAX_NOTE}
                  onChange={(event) => update({ note: event.target.value })}
                  aria-invalid={Boolean(fieldError('note'))}
                  aria-describedby="hunting-log-note-hint"
                />
                <p id="hunting-log-note-hint" className="text-xs text-on-surface-variant">
                  {t(
                    '報告の表には入らず、印刷する出猟の記録にだけ載ります。',
                    'Printed in the day-by-day log only, not in the report.',
                  )}
                </p>
                {fieldError('note') && (
                  <p className="text-sm text-destructive">{errorText(fieldError('note')!, 'note')}</p>
                )}
              </div>
              {submitted && !parsed.outing && (
                <p role="alert" className="rounded-sm bg-error-container p-4 text-sm text-on-error-container">
                  {t('入力内容を確認してください。', 'Check the highlighted items.')}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button onClick={submit}>
                  <LuPlus aria-hidden="true" />
                  {editingId ? t('変更を保存', 'Save changes') : t('記録を追加', 'Add record')}
                </Button>
                {editingId && (
                  <Button variant="ghost" onClick={() => resetForm(lastPrefecture)}>
                    {t('編集をやめる', 'Cancel editing')}
                  </Button>
                )}
              </div>
              {/* Visible copy of the spoken notice, which the region above announces. */}
              {notice && (
                <p className="text-sm font-medium" aria-hidden="true">
                  {t(notice.ja, notice.en)}
                </p>
              )}
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="report" className="text-xl font-medium">
                {t('報告の下書き', 'Report draft')}
              </h2>
              {!report || !selected ? (
                <p className="rounded-sm bg-surface-container p-4 text-sm">
                  {outings.length === 0
                    ? t(
                        '出猟を記録すると、ここに報告の下書きができます。',
                        'Record an outing to get the report draft here.',
                      )
                    : t(
                        '登録の有効期間内の記録を追加すると、報告の下書きを表示します。',
                        'Add a record dated within a registration period to see the report draft.',
                      )}
                </p>
              ) : (
                <>
                  <SelectField
                    fieldId="hunting-log-group"
                    label={t('報告先と登録年度', 'Prefecture and registration year')}
                    value={reportGroupKey(selected)}
                    onChange={setSelectedKey}
                    options={groups.map((group) => ({
                      value: reportGroupKey(group),
                      label: `${group.prefecture}・${group.season}年度`,
                    }))}
                  />
                  <div className="space-y-2">
                    <label htmlFor="hunting-log-registered-on" className="block text-sm font-medium">
                      {t('狩猟者登録を受けた日（任意）', 'Registration date (optional)')}
                    </label>
                    <input
                      id="hunting-log-registered-on"
                      type="date"
                      className="min-h-12 w-full rounded-sm border border-outline bg-surface p-3 text-on-surface"
                      min={registrationDateRange(selected.season).min}
                      max={registrationDateRange(selected.season).max}
                      value={registrationValue}
                      onChange={(event) => {
                        const value = event.target.value;
                        setRegistrationInput({ key: reportGroupKey(selected), value });
                        if (value === '') setRegistrationDate(reportGroupKey(selected), null);
                        else if (isRegistrationDateInRange(value, selected.season))
                          setRegistrationDate(reportGroupKey(selected), value);
                      }}
                      aria-invalid={registrationInvalid}
                      aria-describedby={`hunting-log-registered-on-hint${registrationInvalid ? ' hunting-log-registered-on-error' : ''}`}
                    />
                    <p id="hunting-log-registered-on-hint" className="text-xs text-on-surface-variant">
                      {report.period.fromRegistrationDate
                        ? t(
                            `有効期間を ${formatJapaneseDate(report.period.start)} からとして集計しています。`,
                            `Period counted from ${report.period.start}.`,
                          )
                        : selected.prefecture === '北海道'
                          ? t(
                              '未入力のため、有効期間を 9 月 15 日からとして集計しています。9 月 16 日以後に登録を受けたときは、その日を入力してください（法第五十五条第二項）。',
                              'Not entered: counted from 15 September. If you registered on 16 September or later, enter that date (Act art. 55(2)).',
                            )
                          : t(
                              '未入力のため、有効期間を 10 月 15 日からとして集計しています。10 月 16 日以後に登録を受けたときは、その日を入力してください（法第五十五条第二項）。',
                              'Not entered: counted from 15 October. If you registered on 16 October or later, enter that date (Act art. 55(2)).',
                            )}
                    </p>
                    {registrationInvalid && (
                      <p id="hunting-log-registered-on-error" className="text-sm text-destructive">
                        {t(
                          `${selected.season}年1月1日から${selected.season + 1}年4月15日までの日付を入力してください。この日付は保存していません。`,
                          `Enter a date from 1 January ${selected.season} to 15 April ${selected.season + 1}. This date was not saved.`,
                        )}
                      </p>
                    )}
                  </div>
                  <ResultPanel className="grid-cols-2">
                    <ResultFigure
                      size="lead"
                      label={t('報告期限', 'Report due by')}
                      value={formatJapaneseDate(report.deadline)}
                      note={t(
                        `有効期間が ${formatJapaneseDate(report.period.end)} に満了した場合`,
                        `If the registration ends on ${report.period.end}`,
                      )}
                    />
                    <ResultFigure
                      label={t('捕獲数の合計', 'Total taken')}
                      value={total}
                      note={t(`出猟 ${report.days} 日`, `${report.days} day(s) out`)}
                    />
                  </ResultPanel>
                  <HuntingLogReport draft={report} prefecture={selected.prefecture} />
                  {report.beforeRegistration.length > 0 && (
                    <p className="rounded-sm bg-error-container p-4 text-sm text-on-error-container">
                      {t(
                        `${report.beforeRegistration.length} 件の記録は、入力した登録日（${formatJapaneseDate(report.period.start)}）より前の日付のため、この報告に含めていません。日付を確認してください。`,
                        `${report.beforeRegistration.length} record(s) dated before the registration date entered (${report.period.start}) are left out of this report. Check the dates.`,
                      )}
                    </p>
                  )}
                  {withoutMeshWarning && (
                    <p className="rounded-sm bg-surface-container p-4 text-sm">{withoutMeshWarning}</p>
                  )}
                  <Button className="w-full" onClick={() => window.print()}>
                    <LuPrinter aria-hidden="true" />
                    {t('下書きを印刷する', 'Print draft')}
                  </Button>
                </>
              )}
            </Card>
          }
          extras={
            <>
              <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
                <h2 id="log" className="text-xl font-medium">
                  {t(`出猟の記録（${outings.length} 件）`, `Outings (${outings.length})`)}
                </h2>
                {outside.length > 0 && (
                  <p className="rounded-sm bg-error-container p-4 text-sm text-on-error-container">
                    {t(
                      `${outside.length} 件の記録は、狩猟者登録の有効期間にあたらない日付です（法第五十五条第二項）。どの報告にも含めていません。日付を確認してください。`,
                      `${outside.length} record(s) dated outside any registration period (Act art. 55(2)) are left out of every report. Check the dates.`,
                    )}
                  </p>
                )}
                {listed.length === 0 ? (
                  <p className="text-sm text-on-surface-variant">{t('まだ記録がありません。', 'No records yet.')}</p>
                ) : (
                  <ul className="divide-y divide-outline-variant">
                    {listed.map((outing) => (
                      <li key={outing.id} className="flex flex-wrap items-start gap-2 py-3">
                        <div lang="ja" className="min-w-0 flex-1 text-sm">
                          <p
                            className={cn(
                              'font-medium',
                              (outsideIds.has(outing.id) || beforeRegistrationIds.has(outing.id)) && 'text-destructive',
                            )}
                          >
                            {formatJapaneseDate(outing.date)}　{outing.prefecture}
                            {outing.municipality}
                            {outing.mesh && `（${outing.mesh}）`}
                            {outsideIds.has(outing.id) && '　登録の有効期間外'}
                            {beforeRegistrationIds.has(outing.id) && '　登録日より前'}
                          </p>
                          <p className="text-on-surface-variant">
                            {LICENSE_LABELS[outing.license]}：{describeCatches(outing) ?? '捕獲なし'}
                          </p>
                          {outing.note && <p className="text-on-surface-variant">{outing.note}</p>}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t(
                            `${formatJapaneseDate(outing.date)}の記録を直す`,
                            `Edit the record of ${outing.date}`,
                          )}
                          onClick={() => edit(outing.id)}
                        >
                          <LuPencil aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t(
                            `${formatJapaneseDate(outing.date)}の記録を削除`,
                            `Delete the record of ${outing.date}`,
                          )}
                          onClick={() => remove(outing.id, outing.date)}
                        >
                          <LuTrash2 aria-hidden="true" />
                        </Button>
                        <div className="basis-full">
                          <PhotoAttachments
                            language={language}
                            tool="hunting-log"
                            ownerId={outing.id}
                            savedIn={HUNTING_LOG_STORAGE_KEY}
                            ownerLabel={t(`${formatJapaneseDate(outing.date)}の記録`, `the record of ${outing.date}`)}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <ConditionSection
                id="legal"
                title={t('報告の義務と条文（法第六十六条）', 'The duty to report (Act art. 66)')}
                summary={t(
                  '狩猟者登録の有効期間の満了から 30 日以内に、捕獲等をした場所と鳥獣の種類別の員数を登録都道府県知事に報告します。',
                  'Within 30 days after the registration expires, report where game was taken and how many of each species to the governor of the prefecture of registration.',
                )}
              >
                <div className="space-y-3 text-sm">
                  <p className="text-on-surface-variant">
                    {t(
                      `鳥獣の保護及び管理並びに狩猟の適正化に関する法律・同法施行規則・民法の条文（e-Gov 法令検索、${CHECKED_ON}確認）`,
                      `Japanese text of the Wildlife Protection, Control and Hunting Management Act, its Enforcement Regulation and the Civil Code (e-Gov, checked 23 September 2026)`,
                    )}
                  </p>
                  <blockquote
                    lang="ja"
                    className="space-y-2 border-l-4 border-outline-variant pl-4 text-on-surface-variant"
                  >
                    <p>
                      法第六十六条　狩猟者登録を受けた者は、その狩猟者登録の有効期間が満了したときは、環境省令で定めるところにより、その日から起算して三十日を経過する日までに、その狩猟者登録に係る狩猟の結果を登録都道府県知事に報告しなければならない。
                    </p>
                    <p>
                      施行規則第六十五条第十三項　法第六十六条の規定による報告は、鳥獣の捕獲等をした場所及びその捕獲等をした鳥獣の種類別の員数（前項の規定により狩猟者登録証を返納した者にあっては、当該返納した狩猟者登録証に係るものを含む。）を報告するものとする。
                    </p>
                    <p>
                      法第五十五条第二項　前項の登録（以下「狩猟者登録」という。）の有効期間は、当該狩猟者登録を受けた年の十月十五日（狩猟者登録を受けた日が同月十六日以後であるときは、その狩猟者登録を受けた日）からその日の属する年の翌年の四月十五日までとする。ただし、北海道においては、当該狩猟者登録を受けた年の九月十五日（狩猟者登録を受けた日が同月十六日以後であるときは、その狩猟者登録を受けた日）からその日の属する年の翌年の四月十五日までとする。
                    </p>
                    <p>
                      施行規則様式第十七（狩猟者登録証）裏面の「報告事項」欄：免許の種類／捕獲場所／鳥獣の種類／鳥獣の数量／備考。同様式の注意事項
                      7「返納の際に報告欄に所要事項を記入することにより、鳥獣の保護及び管理並びに狩猟の適正化に関する法律第
                      66 条の報告とすることができる。」
                    </p>
                    <p>
                      同様式 備考
                      6「第一種銃猟免許に係る登録を受けた者のうち、装薬銃及び空気銃を使用して捕獲等をした場合の報告については、装薬銃を使用して捕獲等をした鳥獣については左側の報告事項の欄に、空気銃を使用して捕獲等をした鳥獣については右側の欄にそれぞれ記入すること。」
                      備考
                      7「捕獲の場所欄については、鳥獣保護区等の区域を示す図面に記載されたメッシュ番号等を記載すること。」
                      備考 8「裏面の備考欄については、地域における状況を考慮して記載事項を決定し、必要に応じて（
                      ）書きするなどその旨を明示すること。」
                    </p>
                    <p>
                      民法第百四十条　日、週、月又は年によって期間を定めたときは、期間の初日は、算入しない。ただし、その期間が午前零時から始まるときは、この限りでない。
                    </p>
                    <p>
                      法第八十六条（抄）　次の各号のいずれかに該当する場合には、当該違反行為をした者は、三十万円以下の罰金に処する。……三　第九条第十三項、第六十六条又は第七十五条第一項の規定による報告をせず、又は虚偽の報告をしたとき。
                    </p>
                  </blockquote>
                  <p className="flex flex-wrap gap-x-4 gap-y-2">
                    <a href={LAW_URL} target="_blank" rel="noreferrer">
                      {t('法（e-Gov 法令検索）', 'Act (e-Gov)')}
                    </a>
                    <a href={REGULATION_URL} target="_blank" rel="noreferrer">
                      {t('施行規則・様式第十七（e-Gov 法令検索）', 'Enforcement Regulation and Form 17 (e-Gov)')}
                    </a>
                    <a href={CIVIL_CODE_URL} target="_blank" rel="noreferrer">
                      {t('民法（e-Gov 法令検索）', 'Civil Code (e-Gov)')}
                    </a>
                    <a href={REPORT_DEADLINE_GUIDE.url} target="_blank" rel="noreferrer">
                      {t(REPORT_DEADLINE_GUIDE.name, 'Ehime Prefecture: returning the hunter registration certificate')}
                    </a>
                  </p>
                </div>
                <ul className="list-disc space-y-2 pl-5 text-sm text-on-surface-variant">
                  <li>
                    {t(
                      '鳥獣の種類の選択肢は、施行規則別表第二に掲げる狩猟鳥獣です。',
                      'The species list is the game species in Appended Table 2 of the Enforcement Regulation.',
                    )}
                  </li>
                  <li>
                    {t(
                      `報告期限は、有効期間の末日の翌日を 1 日目として 30 日目です。4 月 15 日に満了すれば 5 月 15 日です（${REPORT_DEADLINE_GUIDE.name}も返納期限を毎年 5 月 15 日としています。${REPORT_DEADLINE_GUIDE.checkedOn} 確認）。`,
                      `The report is due on day 30, counting the day after the registration ends as day 1: 15 May for a registration ending on 15 April (Ehime Prefecture also gives 15 May as the yearly deadline; checked ${REPORT_DEADLINE_GUIDE.checkedOn}).`,
                    )}
                  </li>
                  <li>
                    {t(
                      '報告の様式・備考欄・提出の方法は都道府県で違うことがあります。種類によって出猟カレンダーなど別の用紙や、捕獲年月日・出猟日数を求める都道府県もあります。',
                      'The form, the remarks column and how to submit can differ between prefectures. Some ask for certain species on a separate sheet (such as a hunting calendar), or for the date of each take or the days out.',
                    )}
                  </li>
                </ul>
              </ConditionSection>
            </>
          }
        />
      </div>
      {report && selected && (
        <div className={styles.sheet}>
          <HuntingLogReport draft={report} prefecture={selected.prefecture} full />
        </div>
      )}
    </AppLayout>
  );
}
