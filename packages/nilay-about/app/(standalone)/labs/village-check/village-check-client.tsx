'use client';

import { useEffect, useId, useState } from 'react';
import { LuPrinter, LuSave, LuTrash2 } from 'react-icons/lu';

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
import { labsTool } from '@/lib/labs-tools';
import { cn } from '@/lib/utils';
import {
  VILLAGE_ITEMS,
  VILLAGE_SECTIONS,
  VILLAGE_SOURCES,
  VILLAGE_SOURCES_CHECKED_ON,
  compareInspections,
  previousInspection,
  summarizeInspection,
  type ItemChange,
  type ItemStatus,
} from '@/lib/village-check';
import { rehydrateLanguage, useLanguage, useSetLanguage, type Language } from '@/store';

import { AREA_MAX_LENGTH, NOTE_MAX_LENGTH, VILLAGE_CHECK_STORAGE_KEY, useVillageCheckStore } from './_store';

type Notice = { error: boolean; ja: string; en: string };

const statusLabel = (status: ItemStatus, language: Language) =>
  ({
    unchecked: language === 'ja' ? '未確認' : 'Not checked',
    clear: language === 'ja' ? 'なし' : 'None',
    found: language === 'ja' ? 'あり' : 'Found',
  })[status];

const changeLabel = (change: ItemChange, language: Language) =>
  ({
    new: language === 'ja' ? '新たにあり' : 'New',
    resolved: language === 'ja' ? '解消' : 'Resolved',
    remaining: language === 'ja' ? '前回からあり' : 'Still there',
  })[change];

export function VillageCheckClient() {
  const { draft, inspections, setDate, setArea, setResult, saveInspection, deleteInspection, clearDraft } =
    useVillageCheckStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discarded = useDiscardedSave(VILLAGE_CHECK_STORAGE_KEY);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const formId = useId();
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useVillageCheckStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const summary = summarizeInspection(draft.results);
  // The latest by date; of two on the same date, the one saved last.
  const latest = inspections.reduce<(typeof inspections)[number] | null>(
    (best, inspection) => (best === null || inspection.date >= best.date ? inspection : best),
    null,
  );
  const itemText = (id: string) => VILLAGE_ITEMS.find((item) => item.id === id)?.text[language] ?? id;

  const save = () => {
    const result = saveInspection();
    if (result === 'noDate') {
      document.getElementById(`${formId}-date`)?.focus();
      setNotice({ error: true, ja: '点検日を入力してください。', en: 'Enter the inspection date.' });
      return;
    }
    if (result === 'full') {
      setNotice({
        error: true,
        ja: '保存できる点検は 100 件までです。古い点検を削除してください。',
        en: 'Up to 100 inspections can be kept. Delete older ones.',
      });
      return;
    }
    setNotice({ error: false, ja: '点検を保存しました。', en: 'Inspection saved.' });
  };

  return (
    <AppLayout
      header={
        <AppHeader
          className="print:hidden"
          title={labsTool('village-check').title[language]}
          actions={<LanguageMenu language={language} onLanguageChange={setLanguage} />}
        />
      }
    >
      <p className="sr-only" role="status" lang={language}>
        {discarded ? discardedSaveMessage(language) : ''}
      </p>
      <div lang={language} className="space-y-6 print:hidden" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={VILLAGE_CHECK_STORAGE_KEY} language={language} />
        <StorageUnavailableNotice available={storageAvailable} language={language} />
        <ToolLayout
          resultLabel={t('点検の結果', 'Inspection results')}
          primary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="inspection" className="text-xl font-medium">
                {t('点検', 'Inspection')}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor={`${formId}-date`} className="block text-sm font-medium">
                    {t('点検日', 'Date')}
                  </label>
                  <input
                    id={`${formId}-date`}
                    type="date"
                    value={draft.date}
                    onChange={(event) => setDate(event.target.value)}
                    className="block min-h-12 w-full rounded-lg border border-outline bg-background p-3"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor={`${formId}-area`} className="block text-sm font-medium">
                    {t('集落・地区', 'Village or district')}
                  </label>
                  <input
                    id={`${formId}-area`}
                    type="text"
                    maxLength={AREA_MAX_LENGTH}
                    value={draft.area}
                    onChange={(event) => setArea(event.target.value)}
                  />
                </div>
              </div>
              {VILLAGE_SECTIONS.map((section) => (
                <section key={section.id} aria-labelledby={`${formId}-${section.id}`} className="space-y-3">
                  <h3 id={`${formId}-${section.id}`} className="text-base font-medium">
                    {section.title[language]}
                  </h3>
                  <ul className="space-y-4 text-sm">
                    {section.items.map((item) => {
                      const result = draft.results[item.id] ?? { status: 'unchecked' as const, note: '' };
                      return (
                        <li key={item.id} className="space-y-2 rounded-md border border-outline-variant p-3">
                          <fieldset className="space-y-2">
                            <legend className="font-medium">{item.text[language]}</legend>
                            <div className="flex flex-wrap gap-4">
                              {(['found', 'clear', 'unchecked'] as const).map((status) => (
                                <label key={status} className="flex min-h-10 cursor-pointer items-center gap-2">
                                  <input
                                    type="radio"
                                    name={`${formId}-${item.id}`}
                                    checked={result.status === status}
                                    onChange={() => setResult(item.id, { status })}
                                  />
                                  {statusLabel(status, language)}
                                </label>
                              ))}
                            </div>
                          </fieldset>
                          {result.status === 'found' && (
                            <input
                              type="text"
                              aria-label={t(`「${item.text.ja}」の場所・内容`, `Where and what: ${item.text.en}`)}
                              placeholder={t('場所・内容・対応（任意）', 'Where, what, and what was done (optional)')}
                              maxLength={NOTE_MAX_LENGTH}
                              value={result.note}
                              onChange={(event) => setResult(item.id, { note: event.target.value })}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <details className="text-xs text-on-surface-variant">
                    <summary className="cursor-pointer">{t('出典の記載', 'Source text')}</summary>
                    <ul className="mt-2 space-y-2">
                      {section.items.map((item) => (
                        <li key={item.id}>
                          <p className="font-medium">{item.text[language]}</p>
                          <p lang="ja">
                            「{item.quote}」（{VILLAGE_SOURCES[item.source].publisher}）
                          </p>
                        </li>
                      ))}
                    </ul>
                  </details>
                </section>
              ))}
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 className="text-xl font-medium">{t('点検の結果', 'Inspection results')}</h2>
              <p className="text-lg font-medium tabular-nums">
                {t(
                  `あり ${summary.found}・なし ${summary.clear}・未確認 ${summary.unchecked}`,
                  `Found ${summary.found}, none ${summary.clear}, not checked ${summary.unchecked}`,
                )}
              </p>
              {latest && (
                <ChangeList
                  title={t(`前回（${latest.date}）との比較`, `Compared with the last inspection (${latest.date})`)}
                  changes={compareInspections(draft.results, latest.results)}
                  itemText={itemText}
                  language={language}
                />
              )}
              <div className="flex flex-wrap gap-2">
                <Button onClick={save}>
                  <LuSave aria-hidden="true" />
                  {t('点検を保存', 'Save inspection')}
                </Button>
                <Button variant="outline" onClick={() => window.print()}>
                  <LuPrinter aria-hidden="true" />
                  {t('点検表を印刷する', 'Print the sheet')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm(t('入力中の点検を空にしますか？', 'Clear the inspection being entered?'))) {
                      clearDraft();
                      setNotice(null);
                    }
                  }}
                >
                  {t('入力を空にする', 'Clear the form')}
                </Button>
              </div>
              <p
                role="status"
                className={
                  notice
                    ? cn('rounded-sm p-3 text-sm', notice.error ? 'bg-error-container' : 'bg-surface-container')
                    : 'sr-only'
                }
              >
                {notice ? t(notice.ja, notice.en) : ''}
              </p>
              <p className="text-xs text-on-surface-variant">
                {t(
                  '未入力で印刷すると、現地で書き込む白紙の点検表になります。',
                  'Print with nothing entered for a blank sheet to fill in on site.',
                )}
              </p>
            </Card>
          }
          extras={
            <>
              <ConditionSection
                id="history"
                title={t('保存した点検', 'Saved inspections')}
                summary={t(`${inspections.length} 件`, `${inspections.length}`)}
              >
                {inspections.length === 0 ? (
                  <p className="text-sm text-on-surface-variant">{t('まだありません。', 'None yet.')}</p>
                ) : (
                  <ul className="space-y-4 text-sm">
                    {[...inspections].reverse().map((inspection) => {
                      const counts = summarizeInspection(inspection.results);
                      const before = previousInspection(inspections, inspection.id);
                      return (
                        <li key={inspection.id} className="space-y-2 rounded-md border border-outline-variant p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium">
                              {inspection.date} {inspection.area}
                            </p>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t(
                                `${inspection.date} の点検を削除`,
                                `Delete the inspection of ${inspection.date}`,
                              )}
                              onClick={() => {
                                if (window.confirm(t('この点検を削除しますか？', 'Delete this inspection?')))
                                  deleteInspection(inspection.id);
                              }}
                            >
                              <LuTrash2 aria-hidden="true" />
                            </Button>
                          </div>
                          <p className="tabular-nums">
                            {t(
                              `あり ${counts.found}・なし ${counts.clear}・未確認 ${counts.unchecked}`,
                              `Found ${counts.found}, none ${counts.clear}, not checked ${counts.unchecked}`,
                            )}
                          </p>
                          {before && (
                            <ChangeList
                              title={t(`${before.date} から`, `Since ${before.date}`)}
                              changes={compareInspections(inspection.results, before.results)}
                              itemText={itemText}
                              language={language}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </ConditionSection>
              <ConditionSection
                id="sources"
                title={t('出典', 'Sources')}
                summary={t(`確認日 ${VILLAGE_SOURCES_CHECKED_ON}`, `Checked ${VILLAGE_SOURCES_CHECKED_ON}`)}
              >
                <ul className="space-y-2 text-sm">
                  {Object.values(VILLAGE_SOURCES).map((source) => (
                    <li key={source.url}>
                      <a href={source.url} target="_blank" rel="noreferrer">
                        {source.publisher}「{source.title}」
                      </a>
                    </li>
                  ))}
                </ul>
                <ul className="list-disc space-y-1 pl-5 text-xs text-on-surface-variant">
                  <li>
                    {t(
                      '項目は総務省の集落点検チェックシートの 5－16〜5－18 です。',
                      'The items are 5-16 to 5-18 of the village inspection form.',
                    )}
                  </li>
                  <li>
                    {t(
                      '通知は、点検する人の安全確保への配慮を求めています。',
                      'The notice asks for the safety of the people inspecting to be looked after.',
                    )}
                  </li>
                </ul>
              </ConditionSection>
            </>
          }
        />
      </div>
      <InspectionSheet language={language} className="hidden print:block" />
    </AppLayout>
  );
}

function ChangeList({
  title,
  changes,
  itemText,
  language,
}: {
  title: string;
  changes: { id: string; change: ItemChange }[];
  itemText: (id: string) => string;
  language: Language;
}) {
  return (
    <div className="space-y-1 text-sm">
      <p className="font-medium">{title}</p>
      {changes.length === 0 ? (
        <p className="text-on-surface-variant">{language === 'ja' ? '変化なし' : 'No change'}</p>
      ) : (
        <ul className="list-disc space-y-1 pl-5">
          {changes.map(({ id, change }) => (
            <li key={id}>
              <span className={change === 'resolved' ? 'text-tertiary' : 'text-error'}>
                {changeLabel(change, language)}
              </span>
              ：{itemText(id)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InspectionSheet({ language, className }: { language: Language; className?: string }) {
  const draft = useVillageCheckStore((state) => state.draft);
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const cell = 'border border-black px-2 py-1 align-top';
  return (
    <div lang={language} className={cn('text-sm text-black', className)} data-testid="village-check-sheet">
      <h1 className="text-xl font-medium">{t('集落点検・誘引物チェック表', 'Village and attractant inspection')}</h1>
      <p className="mb-3">
        {t('点検日', 'Date')}：{draft.date || '　　年　　月　　日'}　{t('集落・地区', 'Village')}：
        {draft.area || '＿＿＿＿＿＿'}
      </p>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={cell}>{t('項目', 'Item')}</th>
            <th className={cell}>{t('あり', 'Found')}</th>
            <th className={cell}>{t('なし', 'None')}</th>
            <th className={cell}>{t('場所・内容・対応', 'Where, what, action')}</th>
          </tr>
        </thead>
        <tbody>
          {VILLAGE_ITEMS.map((item) => {
            const result = draft.results[item.id];
            return (
              <tr key={item.id}>
                <td className={cell}>{item.text[language]}</td>
                <td className={cn(cell, 'text-center')}>{result?.status === 'found' ? '●' : '□'}</td>
                <td className={cn(cell, 'text-center')}>{result?.status === 'clear' ? '●' : '□'}</td>
                <td className={cell}>{result?.status === 'found' ? result.note : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
