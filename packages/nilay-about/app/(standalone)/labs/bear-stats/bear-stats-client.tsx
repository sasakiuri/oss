'use client';

import { useEffect, useState, type ReactNode } from 'react';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  DiscardedSaveNotice,
  LanguageMenu,
  ResetButton,
  ResultFigure,
  ResultPanel,
  SegmentedControl,
  SelectField,
  StorageUnavailableNotice,
  ToolLayout,
  discardedSaveMessage,
} from '@/components/labs';
import { Card } from '@/components/ui';
import {
  BEAR_STATS_CHECKED_ON,
  BEAR_STATS_SOURCES,
  CURRENT_FISCAL_YEAR,
  DATASET_YEARS,
  EMERGENCY_SHOOTINGS,
  PREFECTURE_IDS,
  compiledThroughMonth,
  emergencyBoarCount,
  fiscalYearLabel,
  fiscalYearShortLabel,
  monthLabel,
  monthlySeries,
  nationalBySpecies,
  prefectureName,
  prefectureValues,
  rankPrefectures,
  samePeriodLastYear,
  yearValue,
  yearlySeries,
  type BearArea,
  type BearDataset,
  type BearMetric,
  type CaptureMetric,
  type Cell,
  type InjuryMetric,
} from '@/lib/bear-stats';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { labsTool } from '@/lib/labs-tools';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { initialBearStatsSettings, storageKey, useBearStatsStore } from './_store';
import { BarChart } from './bar-chart';

const headCell = 'px-2 py-2 text-right font-medium sm:px-3';
const bodyCell = 'px-2 py-1.5 text-right tabular-nums sm:px-3';
const rowHead = 'sticky left-0 z-10 bg-surface px-2 py-1.5 text-left font-normal sm:px-3';

export function BearStatsClient() {
  const {
    dataset,
    area,
    year,
    injuryMetric,
    captureMetric,
    setDataset,
    setArea,
    setYear,
    setInjuryMetric,
    setCaptureMetric,
  } = useBearStatsStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discardedSave = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useBearStatsStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const metric: BearMetric = dataset === 'injuries' ? injuryMetric : dataset === 'captures' ? captureMetric : 'count';

  const number = (value: number) => new Intl.NumberFormat(language).format(value);
  const cellText = (cell: Cell) =>
    typeof cell === 'number'
      ? number(cell)
      : {
          unpublished: t('掲載なし', 'Not listed'),
          pending: t('未集計', 'Not yet'),
          notApplicable: t('対象外', 'N/A'),
        }[cell];

  const datasetName = (value: BearDataset) =>
    ({
      injuries: t('人身被害', 'Injuries'),
      sightings: t('出没件数', 'Sightings'),
      captures: t('捕獲数', 'Captures'),
      emergency: t('緊急銃猟', 'Emergency shooting'),
    })[value];
  const metricName = (value: BearMetric) =>
    ({
      cases: t('被害件数', 'Incidents'),
      victims: t('被害者数', 'People injured'),
      deaths: t('死亡者数', 'Deaths'),
      total: t('捕獲数（計）', 'Captured (total)'),
      killed: t('捕殺', 'Killed'),
      released: t('非捕殺', 'Not killed'),
      count:
        dataset === 'emergency'
          ? t('発砲に至った事例（クマ類）', 'Cases that reached firing (bears)')
          : t('出没件数', 'Sightings'),
    })[value];
  const unit = (value: BearMetric) =>
    value === 'victims' || value === 'deaths'
      ? t('人', value === 'deaths' ? 'deaths' : 'people')
      : dataset === 'captures'
        ? t('頭', 'bears')
        : t('件', 'cases');
  const areaName = (value: BearArea) => (value === 'national' ? t('全国', 'Japan') : prefectureName(value, language));

  const headline = yearValue(dataset, year, area, metric);
  const partial = year === CURRENT_FISCAL_YEAR;
  const through = compiledThroughMonth(dataset, year);
  const samePeriod = samePeriodLastYear(dataset, year, area, metric);
  const species = area === 'national' ? nationalBySpecies(dataset, year, metric) : null;
  const boar = dataset === 'emergency' ? emergencyBoarCount(year, area) : 0;

  const coverageText = partial
    ? dataset === 'emergency'
      ? t(
          `年度途中（${BEAR_STATS_SOURCES.emergency2026.published}の資料）`,
          `Year in progress (list updated 7 September 2026)`,
        )
      : dataset === 'captures'
        ? t('年度途中（7月末時点）', 'Year in progress (to the end of July)')
        : t(
            `年度途中（${through ?? '—'}月分まで）`,
            `Year in progress (through ${through ? monthLabel(through, 'en') : '—'})`,
          )
    : null;

  const headlineLabel = `${fiscalYearLabel(year, language)}・${areaName(area)}・${metricName(metric)}`;
  const summary =
    typeof headline === 'number'
      ? t(
          `${fiscalYearLabel(year, 'ja')}、${areaName(area)}の${metricName(metric)}は ${number(headline)} ${unit(metric)}（速報値${partial ? '・年度途中' : ''}）。`,
          `${fiscalYearLabel(year, 'en')}, ${areaName(area)}: ${number(headline)} ${unit(metric)} (${metricName(metric).toLowerCase()}, provisional${partial ? ', year in progress' : ''}).`,
        )
      : t(
          `${fiscalYearLabel(year, 'ja')}、${areaName(area)}の${metricName(metric)}は資料に掲載がありません。`,
          `${fiscalYearLabel(year, 'en')}, ${areaName(area)}: not listed in the ministry’s table.`,
        );

  useEffect(() => {
    const timer = window.setTimeout(() => setAnnouncement(summary), 700);
    return () => window.clearTimeout(timer);
  }, [summary]);

  const years = yearlySeries(dataset, area, metric);
  const months = monthlySeries(dataset, year, area, metric);
  const prefectures = prefectureValues(dataset, year, metric);
  const ranked = rankPrefectures(prefectures);
  const emergencyCases = EMERGENCY_SHOOTINGS.filter(
    (entry) => entry.year === year && (area === 'national' || entry.prefecture === area),
  );

  const unlistedNote = (): string | null => {
    if (typeof headline === 'number') return null;
    if (dataset === 'sightings' && area === 'hokkaido')
      return t(
        '北海道は出没数を公表していません（資料の注記）。',
        'Hokkaido does not publish sightings (note to the table).',
      );
    if (dataset === 'captures')
      return t(
        '捕獲数の表に掲載なし（資料は「近年クマの目撃・捕獲実績がない」県を載せていません）。',
        'Not in the capture table, which leaves out prefectures with no recent sightings or captures.',
      );
    return t('資料に掲載なし。', 'Not listed in the ministry’s table.');
  };

  const tableRegion = (label: string, children: ReactNode) => (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="max-h-[28rem] overflow-auto rounded-sm border border-outline-variant"
    >
      {children}
    </div>
  );
  // The chart above it already shows the shape; the exact figures are one tap away.
  const collapsedTable = (label: string, children: ReactNode) => (
    <details className="space-y-2">
      <summary className="flex min-h-12 cursor-pointer items-center text-sm font-medium text-primary">{label}</summary>
      {tableRegion(label, children)}
    </details>
  );

  const speciesColumns = species !== null && area === 'national' && dataset !== 'sightings';

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('bear-stats').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '統計・地域・年度・項目を初期値（人身被害・全国・令和7年度）に戻します。',
                  en: 'The dataset, area, year and measure return to their defaults (injuries, all Japan, FY2025).',
                }}
                onReset={() => useBearStatsStore.setState({ ...initialBearStatsSettings })}
              />
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
            </>
          }
        />
      }
    >
      {/* Mounted empty so later text is announced. */}
      <p className="sr-only" role="status" lang={language}>
        {discardedSave ? discardedSaveMessage(language) : ''}
      </p>
      <p className="sr-only" role="status" lang={language}>
        {announcement}
      </p>
      <div lang={language} className="space-y-6" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={storageKey} language={language} />
        <StorageUnavailableNotice available={storageAvailable} language={language} />
        <ToolLayout
          resultLabel={t('集計結果', 'Figures')}
          primary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <SegmentedControl
                legend={t('統計', 'Dataset')}
                value={dataset}
                options={(['injuries', 'sightings', 'captures', 'emergency'] as const).map((value) => ({
                  value,
                  label: datasetName(value),
                }))}
                onChange={(value) => setDataset(value as BearDataset)}
              />
              <div className="grid grid-cols-2 items-start gap-4">
                <SelectField
                  label={t('地域', 'Area')}
                  value={area}
                  onChange={(value) => setArea(value as BearArea)}
                  options={[
                    { value: 'national', label: t('全国', 'All Japan') },
                    ...PREFECTURE_IDS.map((id) => ({ value: id, label: prefectureName(id, language) })),
                  ]}
                />
                <SelectField
                  label={t('年度', 'Fiscal year')}
                  value={String(year)}
                  onChange={(value) => setYear(Number(value))}
                  options={[...DATASET_YEARS[dataset]].reverse().map((value) => ({
                    value: String(value),
                    label: `${fiscalYearLabel(value, language)}${value === CURRENT_FISCAL_YEAR ? t('（年度途中）', ' (in progress)') : ''}`,
                  }))}
                  hint={t('4 月〜翌年 3 月', 'April to March')}
                />
              </div>
              {dataset === 'injuries' && (
                <SegmentedControl
                  legend={t('項目', 'Measure')}
                  orientation="inline"
                  value={injuryMetric}
                  options={(['cases', 'victims', 'deaths'] as const).map((value) => ({
                    value,
                    label: metricName(value),
                  }))}
                  onChange={(value) => setInjuryMetric(value as InjuryMetric)}
                />
              )}
              {dataset === 'captures' && (
                <SegmentedControl
                  legend={t('項目', 'Measure')}
                  orientation="inline"
                  value={captureMetric}
                  options={(['total', 'killed', 'released'] as const).map((value) => ({
                    value,
                    label: metricName(value),
                  }))}
                  onChange={(value) => setCaptureMetric(value as CaptureMetric)}
                />
              )}
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="result" className="text-xl font-medium">
                {datasetName(dataset)}
              </h2>
              <ResultPanel>
                <ResultFigure
                  size="lead"
                  label={headlineLabel}
                  value={typeof headline === 'number' ? number(headline) : '—'}
                  unit={typeof headline === 'number' ? unit(metric) : undefined}
                  note={
                    typeof headline === 'number'
                      ? `${t('速報値', 'Provisional')}${coverageText ? t('・', '. ') + coverageText : ''}`
                      : unlistedNote()
                  }
                />
                {samePeriod && typeof samePeriod.previous === 'number' && (
                  <ResultFigure
                    label={t(
                      `前年度の同じ期間（${monthLabel(samePeriod.months[0]!, 'ja')}〜${monthLabel(samePeriod.months.at(-1)!, 'ja')}）`,
                      `Same months a year earlier (${monthLabel(samePeriod.months[0]!, 'en')}–${monthLabel(samePeriod.months.at(-1)!, 'en')})`,
                    )}
                    value={number(samePeriod.previous)}
                    unit={unit(metric)}
                    note={t(
                      `${fiscalYearLabel(year - 1, 'ja')}の月別の表から合計`,
                      `Summed from the ${fiscalYearLabel(year - 1, 'en')} monthly table`,
                    )}
                  />
                )}
              </ResultPanel>
              {species && (
                <p className="text-sm text-on-surface-variant">
                  {t(
                    `内訳：ツキノワグマ ${number(species.black)}・ヒグマ ${number(species.brown)}`,
                    `Asian black bear ${number(species.black)}, brown bear ${number(species.brown)}`,
                  )}
                </p>
              )}
              {dataset === 'emergency' && (
                <p className="text-sm text-on-surface-variant">
                  {t(
                    `環境省が把握する事例のうち、発砲に至ったもの。同じ資料のイノシシ ${boar} 件は含みません。`,
                    `Cases known to the ministry that reached firing, excluding the ${boar} wild boar ${boar === 1 ? 'case' : 'cases'} in the same list.`,
                  )}
                </p>
              )}
              {dataset === 'sightings' && (
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '出没件数の集め方は都道府県ごとに異なり、県どうしの比較には向きません。全国の数に北海道は含みません。',
                    'Prefectures count sightings differently, so they are not directly comparable. The national figure excludes Hokkaido.',
                  )}
                </p>
              )}
              {dataset === 'captures' && (
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '許可捕獲（被害防止と特定計画による数の調整）の数で、狩猟による捕獲は含みません。',
                    'Permitted captures (damage prevention and population control under a management plan), not hunting.',
                  )}
                </p>
              )}
              <p className="text-sm">
                {t(
                  '過去の集計です。いまの出没情報と対応は、都道府県・市町村の発表に従ってください。',
                  'These are past figures. For current sightings and what to do, follow the prefecture and municipality.',
                )}
              </p>
              <p className="text-xs text-on-surface-variant">
                {t(
                  `出典：環境省「${sourceTitle(dataset)}」`,
                  `Source: Ministry of the Environment, 「${sourceTitle(dataset)}」`,
                )}
              </p>
            </Card>
          }
          extras={
            <>
              <div className="grid items-start gap-6 lg:grid-cols-2">
                <Card variant="outlined" className="min-w-0 space-y-4 rounded-md p-5 break-inside-avoid sm:p-6">
                  <h2 id="by-year" className="text-xl font-medium">
                    {t(`年度別の推移（${areaName(area)}）`, `By fiscal year (${areaName(area)})`)}
                  </h2>
                  <BarChart
                    label={t(
                      `${areaName(area)}の${metricName(metric)}の年度別の棒グラフ。数値は下の表にあります。`,
                      `Bar chart of ${metricName(metric).toLowerCase()} by fiscal year, ${areaName(area)}. Figures in the table below.`,
                    )}
                    formatValue={number}
                    bars={years.map((point) => ({
                      key: String(point.year),
                      label: fiscalYearShortLabel(point.year, language),
                      value: point.value,
                      selected: point.year === year,
                    }))}
                  />
                  {collapsedTable(
                    t('年度別の表', 'Table by fiscal year'),
                    <table className="w-full min-w-[18rem] border-collapse text-sm">
                      <caption className="sr-only">
                        {t(
                          `${areaName(area)}の${metricName(metric)}（年度別）`,
                          `${metricName(metric)} by fiscal year, ${areaName(area)}`,
                        )}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col" className={`${headCell} sticky left-0 z-20 bg-surface text-left`}>
                            {t('年度', 'Fiscal year')}
                          </th>
                          <th scope="col" className={headCell}>
                            {metricName(metric)}
                          </th>
                          {speciesColumns && (
                            <>
                              <th scope="col" className={headCell}>
                                {t('ツキノワグマ', 'Black bear')}
                              </th>
                              <th scope="col" className={headCell}>
                                {t('ヒグマ', 'Brown bear')}
                              </th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {[...years].reverse().map((point) => {
                          const split = speciesColumns ? nationalBySpecies(dataset, point.year, metric) : null;
                          return (
                            <tr
                              key={point.year}
                              className="border-t border-outline-variant"
                              aria-current={point.year === year ? 'true' : undefined}
                            >
                              <th scope="row" className={rowHead}>
                                {fiscalYearLabel(point.year, language)}
                                {point.partial && (
                                  <span className="ml-1 text-xs text-on-surface-variant">
                                    {t('（年度途中）', '(in progress)')}
                                  </span>
                                )}
                              </th>
                              <td className={bodyCell}>{cellText(point.value)}</td>
                              {speciesColumns && (
                                <>
                                  <td className={bodyCell}>{split ? number(split.black) : '—'}</td>
                                  <td className={bodyCell}>{split ? number(split.brown) : '—'}</td>
                                </>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>,
                  )}
                </Card>

                <Card variant="outlined" className="min-w-0 space-y-4 rounded-md p-5 break-inside-avoid sm:p-6">
                  <h2 id="by-month" className="text-xl font-medium">
                    {t(
                      `月別（${fiscalYearLabel(year, 'ja')}・${areaName(area)}）`,
                      `By month (${fiscalYearLabel(year, 'en')}, ${areaName(area)})`,
                    )}
                  </h2>
                  {months ? (
                    <>
                      <BarChart
                        label={t(
                          `${fiscalYearLabel(year, 'ja')}の${areaName(area)}の${metricName(metric)}の月別の棒グラフ。数値は下の表にあります。`,
                          `Bar chart of ${metricName(metric).toLowerCase()} by month, ${fiscalYearLabel(year, 'en')}, ${areaName(area)}. Figures in the table below.`,
                        )}
                        formatValue={number}
                        bars={months.map((point) => ({
                          key: String(point.month),
                          label: monthLabel(point.month, language),
                          value: point.value,
                        }))}
                      />
                      {collapsedTable(
                        t('月別の表', 'Table by month'),
                        <table className="w-full min-w-[18rem] border-collapse text-sm">
                          <caption className="sr-only">
                            {t(
                              `${fiscalYearLabel(year, 'ja')}の${areaName(area)}の${metricName(metric)}（月別）`,
                              `${metricName(metric)} by month, ${fiscalYearLabel(year, 'en')}, ${areaName(area)}`,
                            )}
                          </caption>
                          <thead>
                            <tr>
                              <th scope="col" className={`${headCell} text-left`}>
                                {t('月', 'Month')}
                              </th>
                              <th scope="col" className={headCell}>
                                {metricName(metric)}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {months.map((point) => (
                              <tr key={point.month} className="border-t border-outline-variant">
                                <th scope="row" className={rowHead}>
                                  {monthLabel(point.month, language)}
                                </th>
                                <td className={bodyCell}>{cellText(point.value)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>,
                      )}
                      {dataset === 'emergency' && year === 2025 && (
                        <p className="text-xs text-on-surface-variant">
                          {t(
                            '「対象外」は、緊急銃猟の実施事例が資料に現れる令和7年9月より前の月です。',
                            '“N/A”: months before September 2025, when emergency shooting cases start in the lists.',
                          )}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-on-surface-variant">
                      {dataset === 'captures'
                        ? t(
                            '捕獲数の月別の数値は公表されていません。',
                            'No monthly figures are published for captures.',
                          )
                        : t(
                            '人身被害の月別の数値は平成26年度以降のみ公表されています。',
                            'Monthly injury figures are published from FY2014 on.',
                          )}
                    </p>
                  )}
                </Card>
              </div>

              <Card variant="outlined" className="min-w-0 space-y-4 rounded-md p-5 break-inside-avoid sm:p-6">
                <h2 id="by-prefecture" className="text-xl font-medium">
                  {t(`都道府県別（${fiscalYearLabel(year, 'ja')}）`, `By prefecture (${fiscalYearLabel(year, 'en')})`)}
                </h2>
                {ranked.length ? (
                  <BarChart
                    layout="rows"
                    label={t(
                      `${fiscalYearLabel(year, 'ja')}の${metricName(metric)}が多い順の都道府県の棒グラフ。数値は下の表にあります。`,
                      `Bar chart of prefectures by ${metricName(metric).toLowerCase()}, ${fiscalYearLabel(year, 'en')}, largest first. Figures in the table below.`,
                    )}
                    formatValue={number}
                    bars={ranked.map((row) => ({
                      key: row.prefecture,
                      label: prefectureName(row.prefecture, language),
                      value: row.value,
                      selected: row.prefecture === area,
                    }))}
                  />
                ) : (
                  <p className="text-sm text-on-surface-variant">
                    {t('この年度は 1 以上の都道府県がありません。', 'No prefecture above zero this year.')}
                  </p>
                )}
                <p className="text-xs text-on-surface-variant">
                  {t(
                    'グラフは多い順（0 は省略）、表は資料の順。九州・沖縄は資料の対象外です。',
                    'Chart: largest first, zeros left out. Table: the ministry’s order. Kyushu and Okinawa are not covered.',
                  )}
                </p>
                {collapsedTable(
                  t('都道府県別の表', 'Table by prefecture'),
                  <table className="w-full min-w-[18rem] border-collapse text-sm">
                    <caption className="sr-only">
                      {t(
                        `${fiscalYearLabel(year, 'ja')}の都道府県別の${metricName(metric)}`,
                        `${metricName(metric)} by prefecture, ${fiscalYearLabel(year, 'en')}`,
                      )}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col" className={`${headCell} sticky left-0 z-20 bg-surface text-left`}>
                          {t('都道府県', 'Prefecture')}
                        </th>
                        <th scope="col" className={headCell}>
                          {metricName(metric)}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {prefectures.map((row) => (
                        <tr
                          key={row.prefecture}
                          className="border-t border-outline-variant"
                          aria-current={row.prefecture === area ? 'true' : undefined}
                        >
                          <th scope="row" className={rowHead}>
                            {prefectureName(row.prefecture, language)}
                          </th>
                          <td className={bodyCell}>{cellText(row.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>,
                )}
              </Card>

              {dataset === 'emergency' && (
                <ConditionSection
                  id="emergency-cases"
                  title={t('緊急銃猟の事例一覧', 'Emergency shooting cases')}
                  summary={t(
                    `${fiscalYearLabel(year, 'ja')}・${areaName(area)}：${emergencyCases.length} 件（イノシシを含む）`,
                    `${fiscalYearLabel(year, 'en')}, ${areaName(area)}: ${emergencyCases.length} cases (wild boar included)`,
                  )}
                >
                  {tableRegion(
                    t('緊急銃猟の事例の表', 'Table of emergency shooting cases'),
                    <table className="w-full min-w-[20rem] border-collapse text-sm">
                      <caption className="sr-only">
                        {t(
                          '発砲まで至った緊急銃猟の事例（環境省が把握する事例に限る）',
                          'Emergency shootings that reached firing, as known to the ministry',
                        )}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col" className={`${headCell} text-left`}>
                            {t('日付', 'Date')}
                          </th>
                          <th scope="col" className={`${headCell} text-left`}>
                            {t('場所', 'Place')}
                          </th>
                          <th scope="col" className={`${headCell} text-left`}>
                            {t('対象鳥獣', 'Animal')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {emergencyCases.map((entry, index) => (
                          <tr key={index} className="border-t border-outline-variant">
                            <td className="px-2 py-1.5 tabular-nums sm:px-3">
                              {t(`${entry.month}月${entry.day}日`, `${monthLabel(entry.month, 'en')} ${entry.day}`)}
                            </td>
                            <td className="px-2 py-1.5 sm:px-3">
                              {prefectureName(entry.prefecture, language)} <span lang="ja">{entry.municipality}</span>
                            </td>
                            <td className="px-2 py-1.5 sm:px-3">
                              {
                                {
                                  black: t('ツキノワグマ', 'Asian black bear'),
                                  brown: t('ヒグマ', 'Brown bear'),
                                  boar: t('イノシシ', 'Wild boar'),
                                }[entry.species]
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>,
                  )}
                </ConditionSection>
              )}

              <ConditionSection
                id="sources"
                title={t('出典', 'Sources')}
                summary={t(
                  `環境省の速報値（${BEAR_STATS_CHECKED_ON} 確認）`,
                  `Provisional figures from the Ministry of the Environment, checked ${BEAR_STATS_CHECKED_ON}`,
                )}
              >
                <ul className="space-y-2 text-sm text-on-surface-variant">
                  {Object.entries(BEAR_STATS_SOURCES).map(([key, source]) => (
                    <li key={key} lang="ja">
                      <a href={source.url} target="_blank" rel="noreferrer" className="underline">
                        {source.title}
                      </a>
                      {source.published && `（${source.published}）`}
                    </li>
                  ))}
                </ul>
                <ul className="list-disc space-y-2 pl-5 text-sm text-on-surface-variant">
                  <li>
                    {t(
                      '環境省が都道府県などから集めた暫定値で、変わることがあります。都道府県の合計は各資料の全国計と一致します。',
                      'Provisional figures the ministry gathered from the prefectures; they may change. The prefectures add up to each table’s national total.',
                    )}
                  </li>
                  <li>
                    {t(
                      '確定値は環境省の「鳥獣関係統計」（確認日時点で令和3年度まで）で公表されますが、区分が異なるため収録していません。',
                      'Final figures appear in the ministry’s wildlife statistics (to FY2021 as of the check date). Their categories differ, so they are not included.',
                    )}
                  </li>
                  <li>
                    {t(
                      '令和8年度の人身被害は、年度別の表が「R08年7月末」まで、月別の表が8月分までです。ここでは月別の表に合わせています。',
                      'For FY2026 injuries, the yearly table runs to the end of July and the monthly table to August. This tool follows the monthly table.',
                    )}
                  </li>
                </ul>
                {storageAvailable && (
                  <p className="text-sm text-on-surface-variant">
                    {t('選択はこのブラウザーに保存されます。', 'Your choices are saved in this browser.')}
                  </p>
                )}
              </ConditionSection>
            </>
          }
        />
      </div>
    </AppLayout>
  );
}

function sourceTitle(dataset: BearDataset): string {
  if (dataset === 'injuries') return BEAR_STATS_SOURCES.injuries.title;
  if (dataset === 'sightings') return BEAR_STATS_SOURCES.sightings.title;
  if (dataset === 'captures') return BEAR_STATS_SOURCES.captures.title;
  return '緊急銃猟実施状況';
}
