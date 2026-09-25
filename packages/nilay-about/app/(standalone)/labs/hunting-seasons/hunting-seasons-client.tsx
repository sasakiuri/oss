'use client';

import { useEffect, useState } from 'react';
import { LuCalendarPlus } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  DateField,
  DiscardedSaveNotice,
  LanguageMenu,
  ResultFigure,
  ResultPanel,
  SelectField,
  ToolLayout,
  discardedSaveMessage,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave } from '@/lib/browser-storage';
import { isIsoDate } from '@/lib/calendar-days';
import {
  NATIONAL_CHECKED_ON,
  NATIONAL_DAILY_LIMITS,
  WILDLIFE_REGULATION_URL,
  dataState,
  dayReport,
  formatRange,
  seasonEvents,
  type SeasonRule,
  type SeasonRuleKind,
} from '@/lib/hunting-seasons';
import { PREFECTURE_SEASONS } from '@/lib/hunting-seasons-data';
import { buildIcs, downloadIcs } from '@/lib/ics';
import { labsTool } from '@/lib/labs-tools';
import { prefectureName } from '@/lib/prefecture-names';
import { PREFECTURES, type Prefecture } from '@/lib/schemas/hunting-log';
import { todayInJapan } from '@/lib/snare-gauge';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { prefectureMaps } from '../hunter-map/prefecture-maps';

import { HUNTING_SEASONS_STORAGE_KEY, useHuntingSeasonsStore } from './_store';

const KIND_NAMES: Record<SeasonRuleKind, { ja: string; en: string }> = {
  extension: { ja: '猟期の延長', en: 'Extended season' },
  shortening: { ja: '猟期の短縮', en: 'Shortened season' },
  bagLimit: { ja: '捕獲数の制限', en: 'Bag limit' },
  prohibition: { ja: '捕獲の禁止', en: 'Capture banned' },
  other: { ja: 'その他', en: 'Other' },
};

export function HuntingSeasonsClient() {
  const { prefecture, day, setPrefecture, setDay } = useHuntingSeasonsStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const discarded = useDiscardedSave(HUNTING_SEASONS_STORAGE_KEY);
  const [ready, setReady] = useState(false);
  const [today] = useState(() => todayInJapan(new Date()));
  const [notice, setNotice] = useState('');
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useHuntingSeasonsStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const date = isIsoDate(day) ? day : today;
  const data = PREFECTURE_SEASONS.find((entry) => entry.prefecture === prefecture);
  const state = dataState(data, today);
  const report = dayReport(prefecture, date, data);
  const fallbackPage = prefectureMaps.find((entry) => entry.prefecture === prefecture)?.url ?? null;
  const pageUrl = data?.overviewUrl ?? fallbackPage;
  const place = prefectureName(prefecture, language);

  const verdict = report.inNationalSeason
    ? t('法定の狩猟期間内です。', 'Within the national hunting season.')
    : report.onlyByExtension
      ? t(
          '法定の狩猟期間外ですが、県の延長の期間内です（対象の鳥獣・区域・猟法に限る）。',
          'Outside the national season, but within a prefectural extension (for its species, area and methods only).',
        )
      : t(
          '狩猟期間外です（猟区・許可捕獲を除く）。',
          'Outside the hunting season (hunting grounds and permits aside).',
        );

  const exportIcs = () => {
    const events = seasonEvents(prefecture, report.season, data);
    downloadIcs(
      `hunting-season-${report.season}-${prefecture}.ics`,
      buildIcs(
        events.map((event) => ({
          uid: `${event.key}-${prefecture}@hunting-seasons.labs.nilay.jp`,
          start: event.period.from,
          end: event.period.to,
          summary: t(event.ja, event.en),
          description: event.url,
          alarmDaysBefore: [7],
        })),
        new Date(),
        t(`猟期 ${place}`, `Hunting season ${place}`),
      ),
    );
    setNotice(t(`${events.length} 件の期間を書き出しました。`, `Exported ${events.length} periods.`));
  };

  const ruleCard = (rule: SeasonRule, applies: boolean | null, index: number) => (
    <li key={index} className="space-y-2 py-3">
      <p className="font-medium">
        {t(KIND_NAMES[rule.kind].ja, KIND_NAMES[rule.kind].en)}：<span lang="ja">{rule.species.join('・')}</span>
        {applies === true && (
          <span className="ml-2 text-sm text-tertiary">{t('この日は期間内', 'In effect on this day')}</span>
        )}
        {applies === false && (
          <span className="ml-2 text-sm text-on-surface-variant">
            {t('この日は期間外', 'Not in effect on this day')}
          </span>
        )}
      </p>
      <dl lang="ja" className="grid gap-x-3 gap-y-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
        {rule.period && (
          <>
            <dt className="text-on-surface-variant">{t('期間', 'Period')}</dt>
            <dd>{formatRange(rule.period)}</dd>
          </>
        )}
        {!rule.period && rule.periodText && (
          <>
            <dt className="text-on-surface-variant">{t('期間', 'Period')}</dt>
            <dd>{rule.periodText}</dd>
          </>
        )}
        <dt className="text-on-surface-variant">{t('区域', 'Area')}</dt>
        <dd>{rule.area || t('資料に記載なし', 'Not stated')}</dd>
        {rule.methods && (
          <>
            <dt className="text-on-surface-variant">{t('猟法', 'Methods')}</dt>
            <dd>{rule.methods}</dd>
          </>
        )}
        {rule.limit && (
          <>
            <dt className="text-on-surface-variant">{t('上限', 'Limit')}</dt>
            <dd>{rule.limit}</dd>
          </>
        )}
      </dl>
      <blockquote lang="ja" className="border-l-4 border-outline-variant pl-4 text-sm text-on-surface-variant">
        {rule.quote}
      </blockquote>
      <p className="text-sm">
        <a href={rule.source.url} target="_blank" rel="noreferrer">
          {rule.source.title || rule.source.url}
        </a>
      </p>
    </li>
  );

  const stateNotice = (() => {
    switch (state) {
      case 'current':
        return null;
      case 'stale':
        return t(
          `この県のデータは ${data?.season} 年度の猟期の資料（確認日 ${data?.checkedOn}）です。今季の告示は県の案内で確かめてください。`,
          `This prefecture’s data is from the documents for the ${data?.season} season (checked ${data?.checkedOn}). Check this season’s notices with the prefecture.`,
        );
      case 'unconfirmed':
      case 'missing':
        return t(
          'この県の延長・制限は未収録です。法定の猟期と捕獲数の上限だけを表示しています。県のページで確かめてください。',
          'This prefecture’s extensions and limits are not collected yet, so only the national season and limits are shown. Check the prefecture’s page.',
        );
    }
  })();

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('hunting-seasons').title[language]}
          actions={<LanguageMenu language={language} onLanguageChange={setLanguage} />}
        />
      }
    >
      <p className="sr-only" role="status" lang={language}>
        {discarded ? discardedSaveMessage(language) : ''}
      </p>
      <p className="sr-only" role="status" lang={language}>
        {ready ? `${place}：${verdict}` : ''}
      </p>
      <p className="sr-only" role="status" lang={language}>
        {notice}
      </p>
      <div lang={language} className="space-y-6" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={HUNTING_SEASONS_STORAGE_KEY} language={language} />
        <ToolLayout
          resultLabel={t('指定日の猟期', 'Season on the day')}
          primary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="where" className="text-xl font-medium">
                {t('都道府県と日付', 'Prefecture and day')}
              </h2>
              <SelectField
                label={t('都道府県', 'Prefecture')}
                value={prefecture}
                onChange={(value) => setPrefecture(value as Prefecture)}
                options={PREFECTURES.map((value) => {
                  const entry = PREFECTURE_SEASONS.find((candidate) => candidate.prefecture === value);
                  const suffix = entry ? '' : t('（未収録）', ' (not collected)');
                  return { value, label: `${prefectureName(value, language)}${suffix}` };
                })}
              />
              <DateField
                label={t('日付', 'Day')}
                value={date}
                onChange={setDay}
                hint={t('空欄なら今日', 'Empty for today')}
              />
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="result" className="text-xl font-medium">
                {t('この日の猟期', 'The season on this day')}
              </h2>
              <ResultPanel>
                <ResultFigure
                  size="lead"
                  label={t(`${place}・法定の狩猟期間`, `${place}, national season`)}
                  value={formatRange(report.national)}
                  note={verdict}
                  tone={report.inNationalSeason || report.onlyByExtension ? 'good' : 'neutral'}
                />
              </ResultPanel>
              {stateNotice && (
                <div
                  role="note"
                  className="space-y-2 rounded-sm bg-error-container p-4 text-sm text-on-error-container"
                >
                  <p>{stateNotice}</p>
                  {pageUrl && (
                    <p>
                      <a href={pageUrl} target="_blank" rel="noreferrer" className="underline">
                        {data?.overviewUrl
                          ? t(`${place}の狩猟の案内`, `${place}: hunting guidance`)
                          : t(
                              `${place}の狩猟に関するページ（鳥獣保護区等位置図）`,
                              `${place}: hunting page (protected area maps)`,
                            )}
                      </a>
                    </p>
                  )}
                </div>
              )}
              {data && data.rules.length > 0 && (
                <div className="space-y-1">
                  <h3 className="font-medium">{t('県の延長・制限', 'Prefectural extensions and limits')}</h3>
                  <ul className="divide-y divide-outline-variant">
                    {report.rules.map(({ rule, applies }, index) => ruleCard(rule, applies, index))}
                  </ul>
                </div>
              )}
              {data && data.rules.length === 0 && state !== 'unconfirmed' && (
                <p className="text-sm">
                  {t(
                    '県の資料に延長・制限の記載はありません。',
                    'The documents show no prefectural extensions or limits.',
                  )}
                </p>
              )}
              <Button className="w-full" onClick={exportIcs}>
                <LuCalendarPlus aria-hidden="true" />
                {t(
                  `${report.season} 年度の猟期をカレンダー（.ics）に書き出す`,
                  `Export the ${report.season} season (.ics)`,
                )}
              </Button>
              <p className="text-xs text-on-surface-variant">
                {t(
                  '日付のある県の延長・短縮も含みます。開始の 1 週間前に通知が鳴ります（通知を取り込まないアプリもあります）。',
                  'Includes dated prefectural extensions and shortenings, with a reminder a week before (some apps drop reminders).',
                )}
              </p>
            </Card>
          }
          extras={
            <>
              <ConditionSection
                id="limits"
                title={t('全国の 1 日の捕獲数の上限と捕獲禁止', 'National daily limits and bans')}
                summary={t('鳥獣保護管理法施行規則 第 10 条', 'Wildlife Regulation art. 10')}
              >
                <table lang="ja" className="w-full text-sm">
                  <caption className="sr-only">
                    {t('1 日当たりの上限（猟区外）', 'Daily limits outside hunting grounds')}
                  </caption>
                  <tbody className="divide-y divide-outline-variant">
                    {NATIONAL_DAILY_LIMITS.map((entry) => (
                      <tr key={entry.species}>
                        <th scope="row" className="py-2 pr-3 text-left font-normal">
                          {entry.species}
                        </th>
                        <td className="py-2 text-right">{entry.limit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '上限は猟区の外で 1 日当たり（第 10 条第 2 項）。',
                    'Per day, outside hunting grounds (art. 10(2)).',
                  )}
                </p>
                <ul lang="ja" className="list-disc space-y-1 pl-5 text-sm">
                  {report.prohibitions.map((entry) => (
                    <li key={entry.species}>
                      {entry.species}：{entry.area}（{entry.until} まで）
                    </li>
                  ))}
                </ul>
                {report.prohibitionsExpired && (
                  <p className="text-sm text-destructive">
                    {t(
                      '第 10 条第 1 項の禁止の期限を過ぎています。現行の規定は施行規則で確かめてください。',
                      'The bans of art. 10(1) have passed their end date. Check the current regulation.',
                    )}
                  </p>
                )}
              </ConditionSection>
              <ConditionSection
                id="sources"
                title={t('出典', 'Sources')}
                summary={t(
                  `法令 ${NATIONAL_CHECKED_ON}・県の資料 ${PREFECTURE_SEASONS.length} 都県`,
                  `Law ${NATIONAL_CHECKED_ON}, prefectural documents for ${PREFECTURE_SEASONS.length} prefectures`,
                )}
              >
                <ul className="list-disc space-y-2 pl-5 text-sm">
                  <li>
                    {t(
                      '法定の狩猟期間：北海道以外は 11 月 15 日〜翌年 2 月 15 日、北海道は 10 月 1 日〜翌年 1 月 31 日。猟区は別（鳥獣保護管理法施行規則 第 9 条）。',
                      'National season: 15 November to 15 February, Hokkaido 1 October to 31 January; hunting grounds differ (Wildlife Regulation art. 9).',
                    )}
                  </li>
                  {data && (
                    <li lang="ja">
                      {t(
                        `${place}：確認日 ${data.checkedOn}、${data.season ?? '—'} 年度の資料。`,
                        `${place}: checked ${data.checkedOn}, documents for ${data.season ?? '—'}.`,
                      )}
                      {data.notes.length > 0 && (
                        <ul className="mt-1 list-disc space-y-1 pl-5 text-on-surface-variant">
                          {data.notes.map((note) => (
                            <li key={note}>{note}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  )}
                </ul>
                <p className="text-sm">
                  <a href={WILDLIFE_REGULATION_URL} target="_blank" rel="noreferrer">
                    {t('鳥獣保護管理法施行規則（e-Gov）', 'Wildlife Regulation (e-Gov)')}
                  </a>
                </p>
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '銃猟禁止区域・鳥獣保護区・休猟区と、捕獲許可による捕獲は含みません。',
                    'No-shooting zones, protected areas and captures under permit are not covered.',
                  )}
                </p>
              </ConditionSection>
            </>
          }
        />
      </div>
    </AppLayout>
  );
}
