'use client';

import { useEffect, useId, useState } from 'react';
import { LuFolderOpen, LuLocateFixed } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  DiscardedSaveNotice,
  LanguageMenu,
  NumberField,
  ResetButton,
  ResultFigure,
  ResultPanel,
  SelectField,
  ToolLayout,
  discardedSaveMessage,
  locationFaultText,
  useCurrentPosition,
} from '@/components/labs';
import { Card } from '@/components/ui';
import { useDiscardedSave } from '@/lib/browser-storage';
import { readExifTime } from '@/lib/exif';
import { labsTool } from '@/lib/labs-tools';
import { MOON_PHASE_BINS, summarise, type CameraPhoto } from '@/lib/trail-camera';
import { readZip } from '@/lib/zip';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { storageKey, useTrailCameraStore } from './_store';

/** Exif sits at the start of a JPEG; reading this much of each photo is enough and keeps memory low. */
const HEADER_BYTES = 256 * 1024;
const isJpegName = (name: string) => /\.jpe?g$/i.test(name);

const zoneOptions = [
  { value: 540, label: 'UTC+9（日本）' },
  ...[-300, -240, 0, 60, 120, 480, 600].map((minutes) => ({
    value: minutes,
    label: `UTC${minutes >= 0 ? '+' : '−'}${Math.abs(minutes) / 60}`,
  })),
];

/** The age range of each of the eight phase parts, in days since new moon. */
const moonPhaseLabel = (index: number, language: 'ja' | 'en') => {
  const from = ((29.53 * index) / MOON_PHASE_BINS).toFixed(1);
  const to = ((29.53 * (index + 1)) / MOON_PHASE_BINS).toFixed(1);
  return language === 'ja' ? `月齢 ${from}〜${to}` : `Age ${from}–${to}`;
};

export function TrailCameraClient() {
  const settings = useTrailCameraStore();
  const { edit, reset } = useTrailCameraStore.getState();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const discarded = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [photos, setPhotos] = useState<CameraPhoto[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const { locate, locating, fault } = useCurrentPosition();
  const inputId = useId();
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useTrailCameraStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const readFiles = async (files: File[]) => {
    setProblem(null);
    const found: CameraPhoto[] = [];
    const missed: string[] = [];
    // Each source is a JPEG, or a ZIP whose JPEG entries are read one by one.
    const sources: { name: string; bytes: () => Promise<Uint8Array> }[] = [];
    for (const file of files) {
      if (/\.zip$/i.test(file.name) || file.type === 'application/zip') {
        try {
          const entries = readZip(new Uint8Array(await file.arrayBuffer()));
          for (const entry of entries)
            if (isJpegName(entry.name)) sources.push({ name: `${file.name}/${entry.name}`, bytes: entry.read });
        } catch {
          setProblem(
            t(`「${file.name}」を ZIP として読めませんでした。`, `“${file.name}” could not be read as a ZIP.`),
          );
        }
      } else if (isJpegName(file.name) || file.type === 'image/jpeg') {
        sources.push({
          name: file.name,
          bytes: async () => new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer()),
        });
      } else missed.push(file.name);
    }
    setReading({ done: 0, total: sources.length });
    for (const [index, source] of sources.entries()) {
      try {
        const time = readExifTime(await source.bytes());
        if (time) found.push({ name: source.name, time });
        else missed.push(source.name);
      } catch {
        missed.push(source.name);
      }
      if (index % 20 === 19) setReading({ done: index + 1, total: sources.length });
    }
    setPhotos(found);
    setSkipped(missed);
    setReading(null);
  };

  const valid = settings.lastValidSettings;
  const location =
    valid.latitude !== null && valid.longitude !== null
      ? { latitude: valid.latitude, longitude: valid.longitude }
      : null;
  const summary =
    photos.length > 0
      ? summarise(photos, {
          zoneOffsetMinutes: valid.zoneOffsetMinutes,
          clockCorrectionMinutes: valid.clockCorrectionMinutes,
          location,
        })
      : null;
  const maxDateHour = summary ? Math.max(1, ...summary.byDateHour.flatMap((row) => row.hours)) : 1;
  const busiestHour = summary ? summary.byHour.indexOf(Math.max(...summary.byHour)) : null;

  const bars = (rows: { label: string; value: number }[], caption: string) => {
    const max = Math.max(1, ...rows.map((row) => row.value));
    return (
      <table className="w-full text-sm">
        <caption className="text-left font-medium">{caption}</caption>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th
                scope="row"
                className="w-28 py-0.5 pr-2 text-left font-normal whitespace-nowrap text-on-surface-variant"
              >
                {row.label}
              </th>
              <td className="py-0.5">
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 rounded-sm bg-primary"
                    style={{ width: `${(row.value / max) * 100}%`, minWidth: row.value > 0 ? 2 : 0 }}
                  />
                  <span className="tabular-nums">{row.value}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };
  const relative = (map: Map<number, number>, event: string) =>
    [...map.entries()]
      .sort(([a], [b]) => a - b)
      .map(([hour, value]) => ({
        label: t(
          hour >= 0 ? `${event}後 ${hour}〜${hour + 1} 時間` : `${event}前 ${-hour - 1}〜${-hour} 時間`,
          hour >= 0 ? `${hour}–${hour + 1} h after` : `${-hour - 1}–${-hour} h before`,
        ),
        value,
      }));

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('trail-camera').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '時刻の設定と地点を初期値に戻し、読み込んだ集計を消します。',
                  en: 'Puts the time settings and place back to the defaults and clears the counts.',
                }}
                onReset={() => {
                  setPhotos([]);
                  setSkipped([]);
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
      <div lang={language} className="space-y-6" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={storageKey} language={language} />
        <ToolLayout
          resultLabel={t('集計', 'Counts')}
          primary={
            <>
              <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
                <h2 id="photos" className="text-xl font-medium">
                  {t('1. 写真を選ぶ', '1. Choose the photos')}
                </h2>
                <p className="text-sm text-on-surface-variant">
                  {t(
                    'SD カードの JPEG 写真をまとめて選ぶか、ZIP にまとめたものを選びます。撮影時刻（Exif）だけを読み、写真は保存も送信もしません。',
                    'Choose the JPEG photos from the SD card, or a ZIP of them. Only the time taken (Exif) is read; the photos are neither saved nor sent.',
                  )}
                </p>
                <input
                  id={inputId}
                  type="file"
                  multiple
                  accept="image/jpeg,.jpg,.jpeg,.zip,application/zip"
                  className="peer sr-only"
                  onChange={(event) => {
                    const files = [...(event.target.files ?? [])];
                    event.target.value = '';
                    if (files.length > 0) void readFiles(files);
                  }}
                />
                <label
                  htmlFor={inputId}
                  className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full border border-outline px-6 text-sm font-medium text-primary hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
                >
                  <LuFolderOpen aria-hidden="true" className="size-[18px]" />
                  {t('写真・ZIP を選ぶ', 'Choose photos or a ZIP')}
                </label>
                <p role="status" className="text-sm">
                  {reading
                    ? t(`読み込み中… ${reading.done} / ${reading.total}`, `Reading… ${reading.done} / ${reading.total}`)
                    : photos.length > 0 || skipped.length > 0
                      ? t(
                          `撮影時刻を読めた写真 ${photos.length} 枚${skipped.length > 0 ? `、読めなかったファイル ${skipped.length} 件` : ''}。`,
                          `${photos.length} photos with a time${skipped.length > 0 ? `, ${skipped.length} files without` : ''}.`,
                        )
                      : ''}
                </p>
                {problem && (
                  <p role="alert" className="text-sm text-destructive">
                    {problem}
                  </p>
                )}
                {skipped.length > 0 && (
                  <details className="text-xs text-on-surface-variant">
                    <summary>{t('読めなかったファイル', 'Files without a time')}</summary>
                    <ul className="mt-1 break-all">
                      {skipped.slice(0, 100).map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </Card>
              <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
                <h2 id="clock" className="text-xl font-medium">
                  {t('2. カメラの時計と場所', '2. Camera clock and place')}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField
                    label={t('カメラの時計のタイムゾーン', 'Camera clock time zone')}
                    value={String(settings.zoneOffsetMinutes)}
                    onChange={(value) => edit({ zoneOffsetMinutes: Number(value) })}
                    options={zoneOptions.map((option) => ({ value: String(option.value), label: option.label }))}
                    hint={t('時差の情報がない写真に使います。', 'Used for photos that carry no offset.')}
                  />
                  <NumberField
                    label={t('時計の補正（足す分）', 'Clock correction (to add)')}
                    value={settings.clockCorrectionMinutes}
                    unit={t('分', 'min')}
                    step={1}
                    invalid={!(Math.abs(settings.clockCorrectionMinutes) <= 1440)}
                    errorText={t('±1,440 分以内です。', 'Within ±1,440 min.')}
                    hint={t(
                      'カメラの時計が 5 分進んでいたら −5。回収時に正しい時計と並べて撮ると分かります。',
                      'If the camera ran 5 min fast, enter −5. Photograph a correct clock when collecting to find out.',
                    )}
                    onChange={(clockCorrectionMinutes) => edit({ clockCorrectionMinutes })}
                  />
                  <NumberField
                    label={t('緯度（日の出入り用）', 'Latitude (for sunrise and sunset)')}
                    value={settings.latitude ?? NaN}
                    step={0.0001}
                    invalid={settings.latitude !== null && !(Math.abs(settings.latitude) <= 90)}
                    errorText={t('-90〜90 です。', '-90 to 90.')}
                    onChange={(value) => edit({ latitude: Number.isFinite(value) ? value : null })}
                  />
                  <NumberField
                    label={t('経度', 'Longitude')}
                    value={settings.longitude ?? NaN}
                    step={0.0001}
                    invalid={settings.longitude !== null && !(Math.abs(settings.longitude) <= 180)}
                    errorText={t('-180〜180 です。', '-180 to 180.')}
                    onChange={(value) => edit({ longitude: Number.isFinite(value) ? value : null })}
                  />
                </div>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 text-sm text-primary underline"
                  disabled={locating}
                  onClick={() =>
                    void locate().then((position) => {
                      if (position)
                        edit({
                          latitude: Math.round(position.latitude * 10000) / 10000,
                          longitude: Math.round(position.longitude * 10000) / 10000,
                        });
                    })
                  }
                >
                  <LuLocateFixed aria-hidden="true" />
                  {locating
                    ? t('取得中…', 'Locating…')
                    : t('現在地を使う（カメラの場所で）', 'Use my location (at the camera)')}
                </button>
                {fault && (
                  <p role="alert" className="text-sm text-destructive">
                    {locationFaultText(fault, language)}
                  </p>
                )}
              </Card>
            </>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="counts" className="text-xl font-medium">
                {t('出没時刻の集計', 'When they came')}
              </h2>
              {!summary ? (
                <p className="text-sm">{t('写真を選ぶと集計します。', 'Choose photos to count them.')}</p>
              ) : (
                <>
                  <ResultPanel className="grid-cols-2">
                    <ResultFigure label={t('写真', 'Photos')} value={summary.total} unit={t('枚', '')} />
                    <ResultFigure
                      label={t('最も多い時間帯', 'Busiest hour')}
                      value={busiestHour === null ? '—' : `${busiestHour}:00–${busiestHour + 1}:00`}
                    />
                  </ResultPanel>
                  {bars(
                    summary.byHour.map((value, hour) => ({ label: `${hour}:00–`, value })),
                    t('時間帯別', 'By hour'),
                  )}
                  {location && (
                    <>
                      {bars(
                        relative(summary.fromSunrise, t('日の出', 'sunrise')),
                        t('日の出からの時間', 'From sunrise'),
                      )}
                      {bars(
                        relative(summary.fromSunset, t('日の入り', 'sunset')),
                        t('日の入りからの時間', 'From sunset'),
                      )}
                      {summary.withoutSunEvent > 0 && (
                        <p className="text-xs">
                          {t(
                            `${summary.withoutSunEvent} 枚は日の出か日の入りのない日の写真で、上の 2 つに含めていません。`,
                            `${summary.withoutSunEvent} photos fall on days without both sunrise and sunset and are left out above.`,
                          )}
                        </p>
                      )}
                    </>
                  )}
                  {bars(
                    summary.byMoonPhase.map((value, index) => ({ label: moonPhaseLabel(index, language), value })),
                    t(`月齢別（${MOON_PHASE_BINS} 区分）`, `By moon phase (${MOON_PHASE_BINS} parts)`),
                  )}
                </>
              )}
            </Card>
          }
          extras={
            <>
              {summary && (
                <ConditionSection
                  id="by-date"
                  title={t('日付×時間帯', 'Date by hour')}
                  summary={t(`${summary.byDateHour.length} 日`, `${summary.byDateHour.length} days`)}
                  defaultOpen
                >
                  <div className="overflow-x-auto">
                    <table className="text-xs tabular-nums">
                      <thead>
                        <tr>
                          <th scope="col" className="pr-2 text-left">
                            {t('日付', 'Date')}
                          </th>
                          {Array.from({ length: 24 }, (_, hour) => (
                            <th key={hour} scope="col" className="w-6 text-center font-normal">
                              {hour}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {summary.byDateHour.map((row) => (
                          <tr key={row.date}>
                            <th scope="row" className="pr-2 text-left font-normal whitespace-nowrap">
                              {row.date}
                            </th>
                            {row.hours.map((value, hour) => (
                              <td
                                key={hour}
                                className="h-6 w-6 border border-surface text-center"
                                style={{
                                  background:
                                    value > 0
                                      ? `color-mix(in srgb, var(--md-sys-color-primary) ${Math.round(15 + (value / maxDateHour) * 85)}%, transparent)`
                                      : undefined,
                                  color: value / maxDateHour > 0.5 ? 'white' : undefined,
                                }}
                              >
                                {value > 0 ? value : ''}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ConditionSection>
              )}
              <ConditionSection
                id="notes"
                title={t('集計のしかた', 'How it counts')}
                summary={t('写真 1 枚を 1 回として数えます', 'Each photo counts once')}
              >
                <ul className="list-disc space-y-2 pl-5 text-sm text-on-surface-variant">
                  <li>
                    {t(
                      '撮影時刻は Exif の撮影日時（CIPA DC-008）です。時差（OffsetTime）が書かれていればそれを、なければ選んだタイムゾーンを使います。',
                      'The time is the Exif time taken (CIPA DC-008), with its OffsetTime when written, or else the chosen time zone.',
                    )}
                  </li>
                  <li>
                    {t(
                      '連写や動画の静止画も 1 枚ずつ数えます。何の動物かは判別しません（写真を見て確かめてください）。',
                      'Bursts count photo by photo. The animal is not identified; look at the photos.',
                    )}
                  </li>
                  <li>
                    {t(
                      '月齢は直前の新月からの日数で、8 つに分けています。',
                      'The moon phase is days since new moon, in eight parts.',
                    )}
                  </li>
                  <li>
                    {t(
                      '動画ファイル（MP4 など）は読みません。ZIP は無圧縮と Deflate 圧縮に対応し、暗号化・ZIP64 には対応しません。',
                      'Video files (MP4 and so on) are not read. ZIPs may be stored or deflated; encrypted and ZIP64 archives are not supported.',
                    )}
                  </li>
                </ul>
              </ConditionSection>
            </>
          }
        />
      </div>
    </AppLayout>
  );
}
