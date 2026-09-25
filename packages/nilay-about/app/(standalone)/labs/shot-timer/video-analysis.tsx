'use client';

import { useEffect, useRef, useState } from 'react';
import { LuFilm } from 'react-icons/lu';

import { Button } from '@/components/ui';
import { detectInRecording, loudestOf, timeShots, type DetectorSettings } from '@/lib/shot-timer';
import type { Language } from '@/store';

interface VideoAnalysisProps {
  language: Language;
  detector: DetectorSettings;
}

/** Longer recordings take the whole sound track into memory at once, which a phone may not have. */
const MAX_FILE_BYTES = 500 * 1024 * 1024;

/**
 * Shot times from the sound track of a video of the reader's own run. The file is decoded in the
 * browser with the Web Audio API and never leaves the page.
 */
export function VideoAnalysis({ language, detector }: VideoAnalysisProps) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const [url, setUrl] = useState<string | null>(null);
  const [events, setEvents] = useState<number[]>([]);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [startIndex, setStartIndex] = useState(0);
  const [status, setStatus] = useState<[string, string] | null>(null);
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const urlRef = useRef<string | null>(null);
  const seconds = (value: number) =>
    new Intl.NumberFormat(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const analyse = async (file: File) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(file);
    setUrl(urlRef.current);
    setEvents([]);
    setExcluded(new Set());
    setStartIndex(0);
    if (file.size > MAX_FILE_BYTES) {
      setStatus([
        '500 MB を超えるファイルは解析しません。短く切ってください。',
        'Files over 500 MB are not analysed. Trim the video first.',
      ]);
      return;
    }
    setBusy(true);
    setStatus(['音声を解析中…', 'Analysing the sound…']);
    let context: AudioContext | null = null;
    try {
      context = new AudioContext();
      const buffer = await context.decodeAudioData(await file.arrayBuffer());
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
      const found = detectInRecording(loudestOf(channels), buffer.sampleRate, detector);
      setEvents(found);
      setStatus(
        found.length === 0
          ? [
              'しきい値を超える音がありませんでした。しきい値を下げてやり直してください。',
              'Nothing reached the threshold. Lower it and try again.',
            ]
          : [
              `${found.length} 件の大きな音。最初の音を開始の合図にしています。`,
              `${found.length} loud sounds. The first is taken as the start signal.`,
            ],
      );
    } catch {
      setStatus([
        'この形式の音声はこのブラウザーで読み取れませんでした。MP4（AAC）や WAV で試してください。',
        'This browser could not read the sound in this file. Try MP4 (AAC) or WAV.',
      ]);
    } finally {
      void context?.close().catch(() => undefined);
      setBusy(false);
    }
  };

  const start = events[startIndex];
  const shots =
    start === undefined
      ? []
      : timeShots(
          start,
          events.filter((_, index) => index !== startIndex && !excluded.has(index)),
        );

  return (
    <div className="space-y-4">
      <div>
        <input
          id="video-file"
          type="file"
          accept="video/*,audio/*"
          className="peer sr-only"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void analyse(file);
          }}
        />
        <label
          htmlFor="video-file"
          className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full border border-outline px-6 text-sm font-medium text-primary peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
        >
          <LuFilm aria-hidden="true" className="size-[18px]" />
          {t('動画・録音を選ぶ', 'Choose a video or recording')}
        </label>
      </div>
      <p role="status" className={status ? 'text-sm' : 'sr-only'}>
        {status ? t(...status) : ''}
      </p>
      {url && (
        <video ref={videoRef} src={url} controls playsInline className="w-full max-w-xl rounded-sm bg-black">
          <track kind="captions" />
        </video>
      )}
      {events.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <caption className="mb-1 text-left font-medium">{t('見つかった音', 'Sounds found')}</caption>
            <thead>
              <tr className="text-left text-on-surface-variant">
                <th scope="col" className="font-normal">
                  {t('ファイル内の時刻', 'In the file')}
                </th>
                <th scope="col" className="font-normal">
                  {t('開始の合図', 'Start signal')}
                </th>
                <th scope="col" className="font-normal">
                  {t('発砲として数える', 'Count as a shot')}
                </th>
                <th scope="col" className="font-normal">
                  <span className="sr-only">{t('再生位置', 'Play position')}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {events.map((time, index) => (
                <tr key={time}>
                  <th scope="row" className="py-1 text-left font-normal">
                    {seconds(time)} s
                  </th>
                  <td>
                    <input
                      type="radio"
                      name="start-signal"
                      aria-label={t(
                        `${seconds(time)} 秒を開始の合図にする`,
                        `Use ${seconds(time)} s as the start signal`,
                      )}
                      checked={startIndex === index}
                      onChange={() => setStartIndex(index)}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={t(`${seconds(time)} 秒を発砲として数える`, `Count ${seconds(time)} s as a shot`)}
                      disabled={startIndex === index}
                      checked={startIndex !== index && !excluded.has(index)}
                      onChange={(event) =>
                        setExcluded((previous) => {
                          const next = new Set(previous);
                          if (event.target.checked) next.delete(index);
                          else next.add(index);
                          return next;
                        })
                      }
                    />
                  </td>
                  <td>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        if (videoRef.current) videoRef.current.currentTime = Math.max(0, time - 0.5);
                      }}
                    >
                      {t('この手前から再生位置に', 'Seek just before')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {shots.length > 0 && (
        <ol className="space-y-1 text-sm tabular-nums">
          {shots.map((shot, index) => (
            <li key={shot.time}>
              {t(
                `${index + 1} 発目 ${seconds(shot.time)} 秒（スプリット ${seconds(shot.split)} 秒）`,
                `Shot ${index + 1}: ${seconds(shot.time)} s (split ${seconds(shot.split)} s)`,
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
