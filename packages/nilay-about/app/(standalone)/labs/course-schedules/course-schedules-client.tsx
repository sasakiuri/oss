'use client';

import { useEffect, useState } from 'react';
import { LuCalendarPlus, LuPlus, LuTrash2 } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  DateField,
  DiscardedSaveNotice,
  LanguageMenu,
  ResetButton,
  SelectField,
  StorageUnavailableNotice,
  ToolLayout,
  discardedSaveMessage,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { COURSE_KIND_NAMES, LINK_KINDS, courseEvents } from '@/lib/course-schedules';
import { COURSE_LINKS, COURSE_LINKS_CHECKED_ON } from '@/lib/course-schedules-data';
import { buildIcs, downloadIcs } from '@/lib/ics';
import { labsTool } from '@/lib/labs-tools';
import { prefectureName } from '@/lib/prefecture-names';
import { COURSE_DATES_MAX, COURSE_KINDS, COURSE_NOTE_MAX, type CourseKind } from '@/lib/schemas/course-schedules';
import { PREFECTURES, type Prefecture } from '@/lib/schemas/hunting-log';
import { todayInJapan } from '@/lib/snare-gauge';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { COURSE_SCHEDULES_STORAGE_KEY, useCourseSchedulesStore } from './_store';

export function CourseSchedulesClient() {
  const store = useCourseSchedulesStore();
  const { prefecture, dates } = store;
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discarded = useDiscardedSave(COURSE_SCHEDULES_STORAGE_KEY);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useCourseSchedulesStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const links = COURSE_LINKS.find((entry) => entry.prefecture === prefecture);
  const place = prefectureName(prefecture, language);
  const events = courseEvents(dates, language, [7, 1]);
  const kindName = (kind: CourseKind) => t(COURSE_KIND_NAMES[kind].ja, COURSE_KIND_NAMES[kind].en);

  const exportIcs = () => {
    const today = todayInJapan(new Date());
    downloadIcs(
      `course-schedules-${today}.ics`,
      buildIcs(events, new Date(), t('講習会・試験の予定', 'Course and exam dates')),
    );
    setNotice(t(`${events.length} 件の予定を書き出しました。`, `Exported ${events.length} events.`));
  };

  const linkList = (entry: (typeof COURSE_LINKS)[number] | undefined) => (
    <ul className="space-y-3 text-sm">
      {LINK_KINDS.map((kind) => {
        const link = entry?.[kind];
        return (
          <li key={kind}>
            <p className="font-medium">{kindName(kind)}</p>
            {link ? (
              <p>
                <a href={link.url} target="_blank" rel="noreferrer" lang="ja">
                  {link.title}
                </a>
                {link.yearSpecific && (
                  <span className="block text-xs text-on-surface-variant">
                    {t(
                      '年度ごとのページで、翌年度は URL が変わることがあります。',
                      'A page for one year; the address may change next year.',
                    )}
                  </span>
                )}
              </p>
            ) : (
              <p className="text-on-surface-variant">{t('未収録', 'Not collected')}</p>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('course-schedules').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '選んだ都道府県と入力した予定を消します。',
                  en: 'Clears the prefecture and the dates entered.',
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
      <p className="sr-only" role="status" lang={language}>
        {notice}
      </p>
      <div lang={language} className="space-y-6" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={COURSE_SCHEDULES_STORAGE_KEY} language={language} />
        <StorageUnavailableNotice available={storageAvailable} language={language} />
        <ToolLayout
          resultLabel={t('日程のページ', 'Schedule pages')}
          primary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="prefecture" className="text-xl font-medium">
                {t('都道府県', 'Prefecture')}
              </h2>
              <SelectField
                label={t('住所地の都道府県', 'Prefecture you live in')}
                value={prefecture}
                onChange={(value) => store.setPrefecture(value as Prefecture)}
                options={PREFECTURES.map((value) => ({
                  value,
                  label: `${prefectureName(value, language)}${
                    COURSE_LINKS.some((entry) => entry.prefecture === value) ? '' : t('（未収録）', ' (not collected)')
                  }`,
                }))}
                hint={t(
                  '猟銃等講習会・技能講習は住所地の都道府県公安委員会が、狩猟免許試験は住所地の都道府県知事が行います。',
                  'The firearms courses are held by the public safety commission, and the licence exam by the governor, of the prefecture you live in.',
                )}
              />
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="links" className="text-xl font-medium">
                {t(`${place}の日程のページ`, `Schedule pages for ${place}`)}
              </h2>
              {linkList(links)}
              {!links && (
                <p className="text-sm">
                  {t(
                    'この都道府県のページは未収録です。都道府県の鳥獣担当課と都道府県警察のサイトを見てください。',
                    'This prefecture is not collected. See the prefecture’s wildlife office and the prefectural police sites.',
                  )}
                </p>
              )}
              <p className="text-xs text-on-surface-variant">
                {t(`確認日 ${COURSE_LINKS_CHECKED_ON}`, `Checked ${COURSE_LINKS_CHECKED_ON}`)}
              </p>
            </Card>
          }
          secondary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <div className="space-y-2">
                <h2 id="dates" className="text-xl font-medium">
                  {t('自分の予定', 'Your dates')}
                </h2>
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '書き出した .ics には 1 週間前と前日の通知が入ります。',
                    'The .ics file has reminders a week and a day before.',
                  )}
                </p>
              </div>
              {dates.map((entry, index) => (
                <fieldset key={entry.id} className="space-y-4 rounded-sm border border-outline-variant p-4">
                  <legend className="px-1 text-sm font-medium">{t(`予定 ${index + 1}`, `Date ${index + 1}`)}</legend>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <SelectField
                      label={t('種類', 'Kind')}
                      value={entry.kind}
                      onChange={(value) => store.updateDate(entry.id, { kind: value as CourseKind })}
                      options={COURSE_KINDS.map((kind) => ({ value: kind, label: kindName(kind) }))}
                    />
                    <div className="min-w-0 space-y-2">
                      <label htmlFor={`note-${entry.id}`} className="block text-sm font-medium">
                        {t('メモ', 'Note')}
                      </label>
                      <input
                        id={`note-${entry.id}`}
                        type="text"
                        value={entry.note}
                        maxLength={COURSE_NOTE_MAX}
                        placeholder={t('例：初心者講習・会場', 'e.g. beginners, venue')}
                        onChange={(event) => store.updateDate(entry.id, { note: event.target.value })}
                      />
                    </div>
                    <DateField
                      label={t('日付（開始日）', 'Date (first day)')}
                      value={entry.date}
                      onChange={(value) => store.updateDate(entry.id, { date: value })}
                    />
                    <DateField
                      label={t('終了日（期間のとき）', 'Last day (for a period)')}
                      value={entry.end}
                      onChange={(value) => store.updateDate(entry.id, { end: value })}
                      invalid={entry.end !== '' && entry.date !== '' && entry.end < entry.date}
                      errorText={t('開始日より後の日を入力してください。', 'Enter a day after the first day.')}
                    />
                  </div>
                  <Button type="button" variant="outline" onClick={() => store.removeDate(entry.id)}>
                    <LuTrash2 aria-hidden="true" />
                    {t('この予定を削除', 'Remove')}
                  </Button>
                </fieldset>
              ))}
              {dates.length < COURSE_DATES_MAX && (
                <Button type="button" variant="outline" onClick={store.addDate}>
                  <LuPlus aria-hidden="true" />
                  {t('予定を追加', 'Add a date')}
                </Button>
              )}
              <Button className="w-full" onClick={exportIcs} disabled={events.length === 0}>
                <LuCalendarPlus aria-hidden="true" />
                {t('カレンダー（.ics）に書き出す', 'Export to calendar (.ics)')}
              </Button>
            </Card>
          }
          extras={
            <ConditionSection
              id="all"
              title={t('収録した都道府県の一覧', 'All collected prefectures')}
              summary={t(`${COURSE_LINKS.length} / 47 都道府県`, `${COURSE_LINKS.length} of 47 prefectures`)}
            >
              <ul className="grid gap-6 sm:grid-cols-2">
                {COURSE_LINKS.map((entry) => (
                  <li key={entry.prefecture} className="space-y-2">
                    <h3 className="font-medium">{prefectureName(entry.prefecture, language)}</h3>
                    {linkList(entry)}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-on-surface-variant">
                {t(
                  '所持許可の更新では、有効な講習修了証明書（交付から 3 年以内）と、猟銃は技能講習修了証明書が必要です（銃刀法 第 5 条の 2）。',
                  'A permit renewal needs a course certificate issued within three years, and for a hunting gun a skills course certificate (Firearms Act art. 5-2).',
                )}
              </p>
            </ConditionSection>
          }
        />
      </div>
    </AppLayout>
  );
}
