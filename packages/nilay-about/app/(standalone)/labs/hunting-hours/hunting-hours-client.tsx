'use client';

import { useEffect, useRef, useState } from 'react';
import { LuChevronLeft, LuChevronRight, LuLocateFixed, LuLoader } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  DiscardedSaveNotice,
  discardedSaveMessage,
  LanguageMenu,
  NumberField,
  ResetButton,
  ResultFigure,
  ResultPanel,
  SelectField,
  ToolLayout,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave } from '@/lib/browser-storage';
import { labsTool } from '@/lib/labs-tools';
import { coordinatesSchema } from '@/lib/schemas/hunting-hours';
import {
  addCalendarDays,
  ceilToMinute,
  floorToMinute,
  formatCalendarDate,
  getDaylightStatus,
  getLocalCalendarDate,
  getSunTimes,
  isSameCalendarDate,
  parseCalendarDate,
} from '@/lib/solar';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { STORAGE_KEY, useHuntingHoursStore } from './_store';
import { LegalNotes } from './legal-notes';
import { presetLocationLabel, presetLocations } from './locations';
import { MoonPanel } from './moon-panel';
import { SavedPlaces } from './saved-places';

const CUSTOM_PRESET = 'custom';

export function HuntingHoursClient() {
  const {
    latitude,
    longitude,
    presetId,
    locations,
    selectPreset,
    clearPreset,
    setLatitude,
    setLongitude,
    setCoordinates,
  } = useHuntingHoursStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const [ready, setReady] = useState(false);
  // Empty until mounted: the day depends on the browser's clock and time zone, not the server's.
  const [dateValue, setDateValue] = useState('');
  const [now, setNow] = useState<Date | null>(null);
  const [locating, setLocating] = useState(false);
  // The fault, not its sentence, so the message follows a language change.
  const [locationFault, setLocationFault] = useState<'unsupported' | 'denied' | 'timeout' | 'failed' | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const discarded = useDiscardedSave(STORAGE_KEY);
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  // ?date= is set only once a day is chosen; without it the page shows today.
  const setDateParameter = (value: string | null) => {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set('date', value);
    else url.searchParams.delete('date');
    try {
      window.history.replaceState(null, '', url);
    } catch {
      // Safari throws after about 100 calls in 30 seconds. The day is kept in state.
    }
  };

  useEffect(() => {
    void Promise.all([useHuntingHoursStore.persist.rehydrate(), rehydrateLanguage()]).then(() => {
      const opened = new Date();
      const requested = new URLSearchParams(window.location.search).get('date');
      const usable = requested !== null && parseCalendarDate(requested) !== null;
      if (requested !== null && !usable) setDateParameter(null);
      setNow(opened);
      setDateValue(usable ? requested : formatCalendarDate(getLocalCalendarDate(opened)));
      setReady(true);
    });
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const date = parseCalendarDate(dateValue);
  const location = coordinatesSchema.safeParse({ latitude, longitude });
  const sun = date && location.success ? getSunTimes(date, location.data.latitude, location.data.longitude) : null;
  const today = now ? getLocalCalendarDate(now) : null;
  const isToday = date !== null && today !== null && isSameCalendarDate(date, today);
  const preset = presetId !== null ? presetLocations.find((item) => item.id === presetId) : undefined;
  const dateInvalid = ready && !date;

  const showDate = (value: string) => {
    setDateValue(value);
    setDateParameter(value || null);
  };
  const showToday = () => {
    if (!today) return;
    setDateValue(formatCalendarDate(today));
    setDateParameter(null);
  };

  const timeFormat = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' });
  // Only for days shorter than a minute.
  const preciseTimeFormat = new Intl.DateTimeFormat(language, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const dateFormat = new Intl.DateTimeFormat(language, { dateStyle: 'full' });
  const coordinateFormat = new Intl.NumberFormat(language, { maximumFractionDigits: 4 });
  // 'floor' never overstates a remaining span; 'ceil' never understates a wait before sunrise.
  const durationText = (milliseconds: number, rounding: 'floor' | 'ceil' = 'floor') => {
    const minutes = milliseconds / 60000;
    const total = Math.max(0, rounding === 'ceil' ? Math.ceil(minutes) : Math.floor(minutes));
    const number = new Intl.NumberFormat(language);
    return t(
      `${number.format(Math.floor(total / 60))} 時間 ${number.format(total % 60)} 分`,
      `${number.format(Math.floor(total / 60))} h ${number.format(total % 60)} min`,
    );
  };

  /** For the status region. Leaves out the countdown, which changes every tick. */
  const summary = (() => {
    if (!location.success || !date || !sun) return '';
    switch (sun.kind) {
      case 'midnight-sun':
        return t('この日は太陽が沈みません。', 'The sun does not set on this day.');
      case 'polar-night':
        return t('この日は太陽が昇りません。', 'The sun does not rise on this day.');
      case 'sunrise-only': {
        const from = timeFormat.format(ceilToMinute(sun.sunrise));
        return t(`日の出 ${from}。この日は日の入りがありません。`, `Sunrise ${from}. There is no sunset on this day.`);
      }
      case 'sunset-only': {
        const to = timeFormat.format(floorToMinute(sun.sunset));
        return t(`日の入り ${to}。この日は日の出がありません。`, `Sunset ${to}. There is no sunrise on this day.`);
      }
      case 'rise-set': {
        const from = ceilToMinute(sun.sunrise);
        const to = floorToMinute(sun.sunset);
        if (to.getTime() <= from.getTime()) {
          return t(
            'この日は日出から日没までが 1 分未満です。',
            'Sunrise and sunset are less than a minute apart on this day.',
          );
        }
        const length = durationText(to.getTime() - from.getTime());
        return t(
          `日の出 ${timeFormat.format(from)}、日の入り ${timeFormat.format(to)}。銃猟可能 ${length}。`,
          `Sunrise ${timeFormat.format(from)}, sunset ${timeFormat.format(to)}. Shooting hours: ${length}.`,
        );
      }
    }
  })();

  useEffect(() => {
    // Debounced so half-typed coordinates are not read out.
    const timer = window.setTimeout(() => setAnnouncement(summary), 700);
    return () => window.clearTimeout(timer);
  }, [summary]);

  // Clear the give-up timer on unmount, and ignore a position that arrives after it: the store persists.
  const giveUpTimer = useRef(0);
  const onThisPage = useRef(true);
  useEffect(() => {
    onThisPage.current = true;
    return () => {
      onThisPage.current = false;
      window.clearTimeout(giveUpTimer.current);
    };
  }, []);

  const locationFaultText = (fault: NonNullable<typeof locationFault>) =>
    fault === 'unsupported'
      ? t('この端末では現在地を取得できません。', 'This device cannot report your location.')
      : fault === 'denied'
        ? t('位置情報の利用が許可されていません。', 'Location access was denied.')
        : fault === 'timeout'
          ? t('現在地を取得できませんでした（時間切れ）。', 'Getting your location timed out.')
          : t('現在地を取得できませんでした。', 'Could not get your location.');

  const locate = () => {
    setLocationFault(null);
    if (!navigator.geolocation) {
      setLocationFault('unsupported');
      return;
    }
    setLocating(true);
    // Some browsers ignore `timeout` when the prompt is suppressed. Longer than that option so it only catches those.
    let settled = false;
    const giveUp = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      giveUpTimer.current = 0;
      setLocating(false);
      setLocationFault('timeout');
    }, 12000);
    giveUpTimer.current = giveUp;
    const finish = (apply: () => void) => {
      if (settled || !onThisPage.current) return;
      settled = true;
      window.clearTimeout(giveUp);
      giveUpTimer.current = 0;
      setLocating(false);
      apply();
    };
    navigator.geolocation.getCurrentPosition(
      (position) =>
        finish(() =>
          setCoordinates({
            latitude: Number(position.coords.latitude.toFixed(4)),
            longitude: Number(position.coords.longitude.toFixed(4)),
          }),
        ),
      (error) =>
        finish(() =>
          setLocationFault(
            error.code === error.PERMISSION_DENIED ? 'denied' : error.code === error.TIMEOUT ? 'timeout' : 'failed',
          ),
        ),
      { timeout: 10000, maximumAge: 60000 },
    );
  };

  const errorBox = (text: string) => (
    <p className="rounded-sm bg-error-container p-4 text-sm leading-relaxed text-on-error-container">{text}</p>
  );

  const results = () => {
    // Before the browser's day is known, the figure holds its place without a time.
    if (!ready) {
      return (
        <ResultPanel>
          <ResultFigure size="lead" label={t('銃猟が可能な時間帯', 'Shooting hours')} value="--:-- – --:--" />
        </ResultPanel>
      );
    }
    if (!location.success)
      return errorBox(t('緯度と経度を正しく入力してください。', 'Enter a valid latitude and longitude.'));
    if (!date || !sun) return errorBox(t('日付を確認してください。', 'Check the date.'));
    if (sun.kind === 'midnight-sun' || sun.kind === 'polar-night') {
      return errorBox(
        `${
          sun.kind === 'midnight-sun'
            ? t(
                'この緯度では、この日は太陽が沈みません（白夜）。',
                'At this latitude the sun does not set on this day.',
              )
            : t(
                'この緯度では、この日は太陽が昇りません（極夜）。',
                'At this latitude the sun does not rise on this day.',
              )
        }`,
      );
    }
    // Every time shown uses the rounded pair, so no minute outside the legal hours is shown.
    const start = sun.kind === 'sunset-only' ? null : ceilToMinute(sun.sunrise);
    const end = sun.kind === 'sunrise-only' ? null : floorToMinute(sun.sunset);
    if (sun.kind === 'rise-set' && start && end && end.getTime() <= start.getTime()) {
      return (
        <>
          {errorBox(
            t(
              '日出から日没までが 1 分未満のため、分単位では銃猟可能な時間帯がありません。',
              'Sunrise and sunset are less than a minute apart, so there are no shooting hours in whole minutes.',
            ),
          )}
          <ResultPanel className="grid-cols-2">
            <ResultFigure
              label={t('日の出（計算値）', 'Sunrise (calculated)')}
              value={preciseTimeFormat.format(sun.sunrise)}
            />
            <ResultFigure
              label={t('日の入り（計算値）', 'Sunset (calculated)')}
              value={preciseTimeFormat.format(sun.sunset)}
            />
          </ResultPanel>
        </>
      );
    }
    const statusText = (current: Date) => {
      const status = getDaylightStatus(start, end, current);
      switch (status.phase) {
        case 'before-sunrise':
          return t(
            `日の出前のため、今は銃猟できません。日の出まであと ${durationText(status.untilMs, 'ceil')}。`,
            `Before sunrise: no shooting yet. Sunrise in ${durationText(status.untilMs, 'ceil')}.`,
          );
        case 'after-sunset':
          return t('日没後のため、今は銃猟できません。', 'After sunset: no shooting now.');
        case 'until-sunset': {
          const left = durationText(status.untilMs);
          return t(`日没まであと ${left}。`, `Sunset in ${left}.`);
        }
        case 'no-sunset':
          return t('今は日出後です。この日は日没がありません。', 'The sun is up and does not set on this day.');
        // Handled above.
        case 'no-bounds':
          return '';
      }
    };
    const status = isToday && now ? statusText(now) : '';
    return (
      <>
        {status && <p className="text-base font-medium leading-relaxed">{status}</p>}
        {(!start || !end) &&
          errorBox(
            `${
              !end
                ? t('この日は日の入りがありません。', 'There is no sunset on this day.')
                : t('この日は日の出がありません。', 'There is no sunrise on this day.')
            }`,
          )}
        <ResultPanel className={start && end ? undefined : 'grid-cols-2'}>
          {start && end ? (
            <ResultFigure
              size="lead"
              label={t('銃猟が可能な時間帯', 'Shooting hours')}
              value={`${timeFormat.format(start)} – ${timeFormat.format(end)}`}
              note={durationText(end.getTime() - start.getTime())}
            />
          ) : (
            <>
              <ResultFigure
                label={t('日の出', 'Sunrise')}
                value={start ? timeFormat.format(start) : '—'}
                note={start ? undefined : t('この日はありません', 'None on this day')}
              />
              <ResultFigure
                label={t('日の入り', 'Sunset')}
                value={end ? timeFormat.format(end) : '—'}
                note={end ? undefined : t('この日はありません', 'None on this day')}
              />
            </>
          )}
        </ResultPanel>
      </>
    );
  };

  const savedPlace = location.success
    ? locations.find((item) => item.latitude === location.data.latitude && item.longitude === location.data.longitude)
    : undefined;
  const coordinatesText = location.success
    ? t(
        `緯度 ${coordinateFormat.format(location.data.latitude)}、経度 ${coordinateFormat.format(location.data.longitude)}`,
        `Latitude ${coordinateFormat.format(location.data.latitude)}, longitude ${coordinateFormat.format(location.data.longitude)}`,
      )
    : t('緯度と経度を確認してください。', 'Check the latitude and longitude.');
  const placeName = savedPlace ? savedPlace.name : preset ? presetLocationLabel(preset, language) : null;
  // The day and the place the hours are for, on the answer itself.
  const resultCaption = [
    date && ready
      ? `${isToday ? t('今日・', 'Today, ') : ''}${dateFormat.format(new Date(date.year, date.month - 1, date.day))}`
      : null,
    placeName ?? (location.success ? coordinatesText : null),
  ]
    .filter(Boolean)
    .join(t('・', ' · '));

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('hunting-hours').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '地点を初期値に戻します。保存した地点は残ります。',
                  en: 'Resets the place. Saved places are kept.',
                }}
                onReset={() => useHuntingHoursStore.getState().reset()}
              />
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
            </>
          }
        />
      }
    >
      {/* Live regions exist from the first paint; a region inserted with text is not announced. The
          notice has its own so it is not read again with every summary change. */}
      <p className="sr-only" role="status" lang={language}>
        {discarded ? discardedSaveMessage(language) : ''}
      </p>
      <p className="sr-only" role="status" lang={language}>
        {announcement}
      </p>
      <div lang={language} className="space-y-6" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={STORAGE_KEY} language={language} />
        <ToolLayout
          resultLabel={t('銃猟が可能な時間帯', 'Shooting hours')}
          primary={
            <Card variant="outlined" className="space-y-3 rounded-md p-5 sm:p-6">
              <div className="flex items-center justify-between gap-2">
                <h2 id="day" className="text-xl font-medium">
                  <label htmlFor="date">{t('日付', 'Date')}</label>
                </h2>
                <Button variant="outline" onClick={showToday}>
                  {t('今日', 'Today')}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t('前の日', 'Previous day')}
                  disabled={!date}
                  onClick={() => date && showDate(formatCalendarDate(addCalendarDays(date, -1)))}
                >
                  <LuChevronLeft aria-hidden="true" />
                </Button>
                <input
                  id="date"
                  type="date"
                  min="1583-01-01"
                  max="9999-12-31"
                  value={dateValue}
                  onChange={(event) => showDate(event.target.value)}
                  aria-invalid={dateInvalid}
                  aria-describedby={dateInvalid ? 'date-error' : undefined}
                  className="min-h-12 min-w-0 flex-1 rounded-sm border border-outline bg-surface p-3 text-on-surface"
                />
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t('次の日', 'Next day')}
                  disabled={!date}
                  onClick={() => date && showDate(formatCalendarDate(addCalendarDays(date, 1)))}
                >
                  <LuChevronRight aria-hidden="true" />
                </Button>
              </div>
              {dateInvalid && (
                <p id="date-error" className="text-sm leading-relaxed text-destructive">
                  {dateValue === ''
                    ? t('日付を入力してください。', 'Enter a date.')
                    : t(
                        '1583 年 1 月 1 日から 9999 年 12 月 31 日までの日付を入力してください。',
                        'Enter a date between 1 January 1583 and 31 December 9999.',
                      )}
                </p>
              )}
              <div id="place" className="space-y-4 border-t border-outline-variant pt-4">
                <SelectField
                  fieldId="preset"
                  label={t('都道府県', 'Prefecture')}
                  value={presetId ?? CUSTOM_PRESET}
                  onChange={(value) => (value === CUSTOM_PRESET ? clearPreset() : selectPreset(value))}
                  options={[
                    ...presetLocations.map((item) => ({ value: item.id, label: presetLocationLabel(item, language) })),
                    { value: CUSTOM_PRESET, label: t('緯度経度を入力', 'Enter coordinates') },
                  ]}
                  hint={
                    preset
                      ? t(
                          `県庁所在地（${coordinatesText}）で計算します。`,
                          `Uses the prefectural capital (${coordinatesText}).`,
                        )
                      : undefined
                  }
                />
                {presetId === null && (
                  <div className="grid grid-cols-2 gap-4">
                    <NumberField
                      label={t('緯度', 'Latitude')}
                      unit="°"
                      hint={t('北緯が正', 'North is positive')}
                      value={latitude}
                      min={-90}
                      max={90}
                      onChange={setLatitude}
                      invalid={!Number.isFinite(latitude) || latitude < -90 || latitude > 90}
                      errorText={t('-90 から 90 の数値を入力してください。', 'Enter a number between -90 and 90.')}
                    />
                    <NumberField
                      label={t('経度', 'Longitude')}
                      unit="°"
                      hint={t('東経が正', 'East is positive')}
                      value={longitude}
                      min={-180}
                      max={180}
                      onChange={setLongitude}
                      invalid={!Number.isFinite(longitude) || longitude < -180 || longitude > 180}
                      errorText={t('-180 から 180 の数値を入力してください。', 'Enter a number between -180 and 180.')}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Button variant="outline" onClick={locate} disabled={locating}>
                    {locating ? (
                      <LuLoader className="animate-spin" aria-hidden="true" />
                    ) : (
                      <LuLocateFixed aria-hidden="true" />
                    )}
                    {locating ? t('現在地を取得中…', 'Getting your location…') : t('現在地を使う', 'Use my location')}
                  </Button>
                  {locationFault && (
                    <p role="alert" className="text-sm leading-relaxed text-destructive">
                      {locationFaultText(locationFault)}{' '}
                      {t('都道府県を選ぶか、緯度経度を入力してください。', 'Choose a prefecture or enter coordinates.')}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          }
          result={
            <>
              <Card variant="outlined" className="min-w-0 space-y-4 rounded-md p-5 sm:p-6">
                <div className="space-y-1">
                  <h2 id="hours" className="text-xl font-medium">
                    {t('日出から日没まで', 'Sunrise to sunset')}
                  </h2>
                  {resultCaption && <p className="text-sm text-on-surface-variant">{resultCaption}</p>}
                </div>
                {results()}
                <p className="text-xs leading-relaxed text-on-surface-variant">
                  {t(
                    'この端末のタイムゾーンの時刻です。太陽の上辺が地平線（大気差 35′8″）に来る時刻で、国立天文台と同じ定義です。日の出は切り上げ、日の入りは切り捨てのため、公表値と 1 分ずれることがあります。',
                    'Times are in this device’s time zone. The sun’s upper limb on the horizon with 35′8″ of refraction, as NAOJ defines it. Sunrise is rounded up and sunset down, so they can be a minute off the published times.',
                  )}
                </p>
              </Card>
              <MoonPanel language={language} date={date} location={location.success ? location.data : null} />
            </>
          }
          secondary={
            <ConditionSection
              id="saved-places"
              title={t('保存した地点', 'Saved places')}
              summary={
                locations.length === 0
                  ? t('なし', 'None')
                  : t(`${locations.length} 件`, `${locations.length} ${locations.length === 1 ? 'place' : 'places'}`)
              }
            >
              <SavedPlaces />
            </ConditionSection>
          }
          extras={<LegalNotes language={language} />}
        />
      </div>
    </AppLayout>
  );
}
