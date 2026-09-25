'use client';

import { useEffect, useState } from 'react';
import { LuPrinter } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  DiscardedSaveNotice,
  LanguageMenu,
  ToolLayout,
  discardedSaveMessage,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave } from '@/lib/browser-storage';
import { labsTool } from '@/lib/labs-tools';
import { GAUGES, TRACE_SOURCES, TRACE_SOURCES_CHECKED_ON, layoutGauges, type GaugeKind } from '@/lib/trace-gauge';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { TRACE_GAUGE_STORAGE_KEY, useTraceGaugeStore } from './_store';
import { GaugePage } from './gauge-page';
import styles from './trace-gauge-print.module.css';

export function TraceGaugeClient() {
  const { selected, toggle, selectAll, clear } = useTraceGaugeStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const discarded = useDiscardedSave(TRACE_GAUGE_STORAGE_KEY);
  const [ready, setReady] = useState(false);
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useTraceGaugeStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const chosen = GAUGES.filter((gauge) => selected.includes(gauge.id));
  const pages = layoutGauges(chosen);

  const group = (kind: GaugeKind) => (
    <fieldset className="space-y-2">
      <legend className="text-base font-medium">{kind === 'print' ? t('足跡', 'Prints') : t('糞', 'Droppings')}</legend>
      <ul className="space-y-2 text-sm">
        {GAUGES.filter((gauge) => gauge.kind === kind).map((gauge) => (
          <li key={gauge.id}>
            <label className="flex min-h-10 cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.includes(gauge.id)}
                onChange={() => toggle(gauge.id)}
              />
              <span>
                {gauge.species[language]}：{gauge.part[language]}
                <span lang="ja" className="block text-xs text-on-surface-variant">
                  「{gauge.quote}」（{TRACE_SOURCES[gauge.source].label}）
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );

  return (
    <AppLayout
      header={
        <AppHeader
          className="print:hidden"
          title={labsTool('trace-gauge').title[language]}
          actions={<LanguageMenu language={language} onLanguageChange={setLanguage} />}
        />
      }
    >
      <p className="sr-only" role="status" lang={language}>
        {discarded ? discardedSaveMessage(language) : ''}
      </p>
      <div lang={language} className="space-y-6 print:hidden" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={TRACE_GAUGE_STORAGE_KEY} language={language} />
        <ToolLayout
          resultLabel={t('プレビューと印刷', 'Preview and print')}
          primary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="gauges" className="text-xl font-medium">
                {t('印刷するゲージ', 'Gauges to print')}
              </h2>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={selectAll}>
                  {t('すべて選ぶ', 'Select all')}
                </Button>
                <Button variant="outline" size="sm" onClick={clear}>
                  {t('すべて外す', 'Clear all')}
                </Button>
              </div>
              {group('print')}
              {group('scat')}
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 className="text-xl font-medium">{t('プレビューと印刷', 'Preview and print')}</h2>
              {pages.length === 0 ? (
                <p className="rounded-sm bg-surface-container p-4 text-sm">
                  {t('ゲージを選んでください。', 'Choose at least one gauge.')}
                </p>
              ) : (
                <>
                  {pages.map((page, index) => (
                    <figure key={index} className="space-y-2 rounded-sm bg-surface-container p-4">
                      <GaugePage
                        gauges={page}
                        language={language}
                        label={t(`${index + 1} ページ目のプレビュー`, `Preview of page ${index + 1}`)}
                        className="mx-auto max-h-[32rem] w-full drop-shadow-sm"
                      />
                      <figcaption className="text-center text-sm text-on-surface-variant">
                        {t(`${index + 1} / ${pages.length} ページ`, `Page ${index + 1} of ${pages.length}`)}
                      </figcaption>
                    </figure>
                  ))}
                  <Button className="w-full" onClick={() => window.print()}>
                    <LuPrinter aria-hidden="true" />
                    {t('印刷する', 'Print')}
                  </Button>
                </>
              )}
              <ul className="list-disc space-y-1 pl-5 text-xs text-on-surface-variant">
                <li>
                  {t(
                    '「実際のサイズ（100%）」で印刷し、確認線が 100 mm あるか定規で測ります。',
                    'Print at Actual size (100%) and check with a ruler that the check line is 100 mm.',
                  )}
                </li>
                <li>
                  {t(
                    'アナグマの足跡は、特定外来生物編では前後とも長さ 6.5 cm・幅 5 cm です。',
                    'For badger prints, the invasive species edition gives 6.5 × 5 cm for both feet.',
                  )}
                </li>
              </ul>
            </Card>
          }
          extras={
            <ConditionSection
              id="sources"
              title={t('出典', 'Sources')}
              summary={t(`確認日 ${TRACE_SOURCES_CHECKED_ON}`, `Checked ${TRACE_SOURCES_CHECKED_ON}`)}
            >
              <ul className="space-y-2 text-sm">
                {Object.values(TRACE_SOURCES).map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.label}
                    </a>
                  </li>
                ))}
              </ul>
            </ConditionSection>
          }
        />
      </div>
      {pages.length > 0 && (
        <div className={styles.sheets}>
          {pages.map((page, index) => (
            <div key={index} className={styles.page}>
              <GaugePage gauges={page} language={language} actualSize className="block" />
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
