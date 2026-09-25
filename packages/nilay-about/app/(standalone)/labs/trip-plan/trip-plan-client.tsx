'use client';

import { useEffect, useId, useState } from 'react';
import { LuCalendarPlus, LuCopy, LuPrinter } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  DiscardedSaveNotice,
  LanguageMenu,
  ResetButton,
  ToolLayout,
  discardedSaveMessage,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave } from '@/lib/browser-storage';
import { download } from '@/lib/hunter-map-export';
import { labsTool } from '@/lib/labs-tools';
import { TRIP_NOTE_MAX, TRIP_TEXT_MAX, buildIcs, localToDate, tripProblems, type TripPlan } from '@/lib/trip-plan';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { storageKey, useTripPlanStore } from './_store';

type Field = keyof TripPlan;

export function TripPlanClient() {
  const state = useTripPlanStore();
  const { edit, setSaveOnDevice, reset } = useTripPlanStore.getState();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const discarded = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState<'done' | 'failed' | null>(null);
  const baseId = useId();
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useTripPlanStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const labels: Record<Field, string> = {
    hunter: t('氏名', 'Name'),
    companions: t('同行者', 'With'),
    area: t('行き先（猟場・山域）', 'Where (hunting ground)'),
    route: t('行程・入山口・駐車場所・位置図の番号など', 'Route, entry point, parking, map numbers'),
    departAt: t('出発', 'Leaving'),
    returnBy: t('帰着予定', 'Back by'),
    vehicle: t('車両（車種・色・ナンバー）', 'Vehicle (model, colour, plate)'),
    radio: t('無線・連絡手段', 'Radio, how to reach'),
    gear: t('装備（銃・猟犬・食料・ライトなど）', 'Gear (gun, dogs, food, light)'),
    contactName: t('緊急連絡先（氏名）', 'Emergency contact (name)'),
    contactPhone: t('緊急連絡先（電話）', 'Emergency contact (phone)'),
    ifLate: t('帰着予定を過ぎて連絡がないとき', 'If not back and not heard from'),
    notes: t('その他', 'Other notes'),
  };
  const long: Field[] = ['route', 'gear', 'ifLate', 'notes'];
  const order: Field[] = [
    'hunter',
    'companions',
    'area',
    'route',
    'departAt',
    'returnBy',
    'vehicle',
    'radio',
    'gear',
    'contactName',
    'contactPhone',
    'ifLate',
    'notes',
  ];
  const problems = ready ? tripProblems(state) : [];
  const timeText = (value: string) => {
    const date = localToDate(value);
    return date ? new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(date) : value;
  };
  const shown = (field: Field) =>
    field === 'departAt' || field === 'returnBy' ? timeText(state[field]) : state[field];
  const cardLines = order
    .filter((field) => state[field].trim() !== '')
    .map((field) => [labels[field], shown(field)] as const);
  const asText = [t('【出猟の予定】', 'Outing plan'), ...cardLines.map(([label, value]) => `${label}: ${value}`)].join(
    '\n',
  );

  const exportIcs = () => {
    const ics = buildIcs(
      state,
      {
        summary: t(`出猟: ${state.area || state.hunter}`, `Hunting: ${state.area || state.hunter}`),
        alarm: t(
          `${state.hunter || '出猟者'}の帰着予定の時刻です。連絡がなければ、決めておいた手順で確かめてください。`,
          `${state.hunter || 'The hunter'} is due back now. If you have not heard, follow the agreed steps.`,
        ),
        lines: order
          .filter((field) => field !== 'departAt' && field !== 'returnBy')
          .map((field) => [labels[field], state[field]]),
      },
      `${crypto.randomUUID()}@about.nilay.jp`,
      new Date(),
    );
    if (ics) download(ics, 'trip-plan.ics', 'text/calendar');
  };

  return (
    <AppLayout
      header={
        <AppHeader
          className="print:hidden"
          title={labsTool('trip-plan').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{ ja: '入力した予定をすべて消します。', en: 'Clears the whole plan.' }}
                onReset={() => {
                  setCopied(null);
                  reset();
                }}
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
      <div lang={language} className="space-y-6 print:hidden" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={storageKey} language={language} />
        <ToolLayout
          resultLabel={t('予定のカード', 'Plan card')}
          primary={
            <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
              <h2 id="plan" className="text-xl font-medium">
                {t('出猟の予定', 'The outing')}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {order.map((field) => {
                  const id = `${baseId}-${field}`;
                  const invalid =
                    (field === 'departAt' && problems.includes('depart') && state.departAt !== '') ||
                    (field === 'returnBy' &&
                      ((problems.includes('return') && state.returnBy !== '') || problems.includes('order')));
                  return (
                    <div
                      key={field}
                      className={long.includes(field) ? 'min-w-0 space-y-2 sm:col-span-2' : 'min-w-0 space-y-2'}
                    >
                      <label htmlFor={id} className="block text-sm font-medium">
                        {labels[field]}
                      </label>
                      {long.includes(field) ? (
                        <textarea
                          id={id}
                          rows={2}
                          maxLength={TRIP_NOTE_MAX}
                          value={state[field]}
                          onChange={(event) => edit({ [field]: event.target.value })}
                          className="w-full rounded-sm border border-outline bg-surface p-3 text-base text-on-surface"
                        />
                      ) : (
                        <input
                          id={id}
                          type={
                            field === 'departAt' || field === 'returnBy'
                              ? 'datetime-local'
                              : field === 'contactPhone'
                                ? 'tel'
                                : 'text'
                          }
                          maxLength={TRIP_TEXT_MAX}
                          value={state[field]}
                          aria-invalid={invalid}
                          aria-describedby={invalid ? `${id}-error` : undefined}
                          onChange={(event) => edit({ [field]: event.target.value })}
                        />
                      )}
                      {invalid && (
                        <p id={`${id}-error`} className="text-sm text-destructive">
                          {problems.includes('order')
                            ? t('帰着予定は出発より後にしてください。', 'Make the return later than the departure.')
                            : t('日時を入力してください。', 'Enter a date and time.')}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={state.saveOnDevice}
                  onChange={(event) => setSaveOnDevice(event.target.checked)}
                />
                {t('この端末に保存する', 'Save on this device')}
              </label>
              <p className="text-xs text-on-surface-variant">
                {t('保存をやめると、保存していた内容は消えます。', 'Turning saving off deletes what was kept.')}
              </p>
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-4 rounded-md p-5 sm:p-6">
              <h2 id="card" className="text-xl font-medium">
                {t('家族や猟隊に渡すカード', 'Card for family or party')}
              </h2>
              {cardLines.length === 0 ? (
                <p className="text-sm">{t('入力するとここに表示します。', 'Shown here as you fill it in.')}</p>
              ) : (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  {cardLines.map(([label, value]) => (
                    <div key={label} className="contents">
                      <dt className="text-on-surface-variant">{label}</dt>
                      <dd className="break-words whitespace-pre-wrap">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => window.print()} disabled={cardLines.length === 0}>
                  <LuPrinter aria-hidden="true" />
                  {t('カードを印刷', 'Print the card')}
                </Button>
                <Button variant="outline" disabled={problems.length > 0} onClick={exportIcs}>
                  <LuCalendarPlus aria-hidden="true" />
                  {t('カレンダーに追加（.ics）', 'Add to calendar (.ics)')}
                </Button>
                <Button
                  variant="outline"
                  disabled={cardLines.length === 0}
                  onClick={() =>
                    void navigator.clipboard?.writeText(asText).then(
                      () => setCopied('done'),
                      () => setCopied('failed'),
                    )
                  }
                >
                  <LuCopy aria-hidden="true" />
                  {t('文章をコピー', 'Copy as text')}
                </Button>
              </div>
              {copied && (
                <p role="status" className="text-sm">
                  {copied === 'done'
                    ? t('コピーしました。', 'Copied.')
                    : t('コピーできませんでした。', 'Could not copy.')}
                </p>
              )}
              <p className="text-xs text-on-surface-variant">
                {t(
                  '.ics を家族の端末のカレンダーに取り込んでもらうと、帰着予定の時刻にその端末で通知が鳴ります。遅れても、ほかに自動で知らせる仕組みはありません。',
                  'Imported into a family member’s calendar, the .ics alerts on their device at the time due back. Nothing else tells anyone if you are late.',
                )}
              </p>
            </Card>
          }
        />
      </div>
      <section
        className="hidden bg-white p-6 text-black print:block"
        aria-label={t('印刷用のカード', 'Printable card')}
      >
        <div className="max-w-[16cm] space-y-2 border-2 border-black p-4">
          <h1 className="text-lg font-bold">{t('出猟の予定', 'Outing plan')}</h1>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            {cardLines.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="font-medium">{label}</dt>
                <dd className="whitespace-pre-wrap">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </AppLayout>
  );
}
