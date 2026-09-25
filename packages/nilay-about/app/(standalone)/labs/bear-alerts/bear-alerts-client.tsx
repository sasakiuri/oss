'use client';

import { useId, useState } from 'react';
import { LuBell, LuTrash2 } from 'react-icons/lu';
import { z } from 'zod';

import { ScheduledChecksPaused, ConditionSection, ToolLayout } from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { errorKind, ERROR_MESSAGES, sendJson } from '@/features/labs-notify/client';
import { PlacePicker } from '@/features/labs-notify/components/place-picker';
import { problemText, PushSetup } from '@/features/labs-notify/components/push-setup';
import { NoticeLine, ToolFrame, type Notice } from '@/features/labs-notify/components/tool-frame';
import { usePush } from '@/features/labs-notify/use-push';
import { useRenewal } from '@/features/labs-notify/use-renewal';
import { BEAR_SOURCES, RADIUS_KM_OPTIONS, RECENT_DAYS } from '@/lib/bear-alerts';
import { labsTool } from '@/lib/labs-tools';
import { SCHEDULED_CHECKS_PAUSED } from '@/lib/scheduled-checks';
import { BEAR_PLACES_MAX } from '@/lib/schemas/bear-alerts';
import { useLanguage, type Language } from '@/store';

import { BEAR_ALERTS_STORAGE_KEY, useBearAlertsStore } from './_store';

const registeredSchema = z.object({ expiresAt: z.string() });
const rehydrate = () => useBearAlertsStore.persist.rehydrate();

export function BearAlertsClient() {
  const { value, set } = useBearAlertsStore();
  const push = usePush();
  const [radiusKm, setRadiusKm] = useState<number>(5);
  const [notice, setNotice] = useState<Notice | null>(null);
  const pageLanguage = useLanguage();

  // Renews the server's record and this device's subscription together on each visit.
  useRenewal(push.subscription, value.registeredUntil !== null, async (subscription) => {
    const { expiresAt } = await sendJson(
      '/api/labs/bear-alerts',
      'PUT',
      { subscription, language: pageLanguage, places: value.places },
      z.object({ expiresAt: z.string() }),
    );
    set({ ...useBearAlertsStore.getState().value, registeredUntil: expiresAt });
  });
  const radiusId = useId();

  const register = async (language: Language) => {
    if (value.places.length === 0) return;
    const subscription = push.subscription ?? (await push.enable());
    if (!subscription) return;
    try {
      const { expiresAt } = await sendJson(
        '/api/labs/bear-alerts',
        'PUT',
        { subscription, language, places: value.places },
        registeredSchema,
      );
      set({ ...value, registeredUntil: expiresAt });
      setNotice({ error: false, ja: '通知の登録を保存しました。', en: 'Alert places saved.' });
    } catch (error) {
      setNotice({ error: true, ...ERROR_MESSAGES[errorKind(error)] });
    }
  };

  const unregister = async () => {
    if (!push.subscription) {
      set({ ...value, registeredUntil: null });
      return;
    }
    try {
      await sendJson(
        '/api/labs/bear-alerts',
        'DELETE',
        { subscription: push.subscription },
        z.object({ removed: z.boolean() }),
      );
      set({ ...value, registeredUntil: null });
      setNotice({ error: false, ja: 'クマ出没の通知を止めました。', en: 'Bear alerts stopped.' });
    } catch (error) {
      const kind = errorKind(error);
      // Nothing registered on the server: the device's record is simply stale.
      if (kind === 'notFound') set({ ...value, registeredUntil: null });
      setNotice({ error: kind !== 'notFound', ...ERROR_MESSAGES[kind] });
    }
  };

  const source = BEAR_SOURCES[0];

  return (
    <ToolFrame title={labsTool('bear-alerts').title} storageKey={BEAR_ALERTS_STORAGE_KEY} rehydrate={rehydrate}>
      {(language) => {
        const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
        return (
          <ToolLayout
            resultLabel={t('通知の登録', 'Registration')}
            primary={
              <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
                <h2 className="text-xl font-medium">{t('通知を受け取る地点', 'Places to watch')}</h2>
                {value.places.length === 0 ? (
                  <p className="text-sm text-on-surface-variant">
                    {t('地点はまだありません（最大 5 地点）。', 'No places yet (up to five).')}
                  </p>
                ) : (
                  <ul className="space-y-2" aria-label={t('登録した地点', 'Places')}>
                    {value.places.map((place, index) => (
                      <li
                        key={`${place.latitude},${place.longitude},${index}`}
                        className="flex items-center justify-between gap-2 rounded-sm bg-surface-container p-3 text-sm"
                      >
                        <span>
                          {place.latitude.toFixed(4)}, {place.longitude.toFixed(4)} ・{' '}
                          {t(`半径 ${place.radiusKm} km`, `${place.radiusKm} km radius`)}
                        </span>
                        <Button
                          variant="outline"
                          aria-label={t('この地点を削除', 'Remove this place')}
                          onClick={() => set({ ...value, places: value.places.filter((_, i) => i !== index) })}
                        >
                          <LuTrash2 aria-hidden="true" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <PlacePicker
                  language={language}
                  disabled={value.places.length >= BEAR_PLACES_MAX}
                  onAdd={(place) => set({ ...value, places: [...value.places, { ...place, radiusKm }] })}
                >
                  <div className="space-y-1">
                    <label htmlFor={radiusId} className="block text-sm">
                      {t('半径', 'Radius')}
                    </label>
                    <select id={radiusId} value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))}>
                      {RADIUS_KM_OPTIONS.map((km) => (
                        <option key={km} value={km}>
                          {km} km
                        </option>
                      ))}
                    </select>
                  </div>
                </PlacePicker>
                <p className="text-xs text-on-surface-variant">
                  {t(
                    '登録すると緯度・経度・半径をサーバーに保存します。',
                    'Registering stores the latitude, longitude and radius on the server.',
                  )}
                </p>
              </Card>
            }
            result={
              <div className="space-y-4">
                <PushSetup push={push} language={language} />
                <Card variant="outlined" className="space-y-3 rounded-md p-5 sm:p-6">
                  <h2 className="text-xl font-medium">{t('通知の登録', 'Registration')}</h2>
                  <p className="text-sm">
                    {value.registeredUntil
                      ? t(
                          `登録済み。${new Date(value.registeredUntil).toLocaleDateString('ja-JP')} まで有効です（登録し直すと延長）。`,
                          `Registered until ${new Date(value.registeredUntil).toLocaleDateString('en-GB')} (register again to extend).`,
                        )
                      : t('未登録です。', 'Not registered.')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <ScheduledChecksPaused language={language} />
                    <Button
                      onClick={() => void register(language)}
                      disabled={SCHEDULED_CHECKS_PAUSED || push.busy || value.places.length === 0}
                    >
                      <LuBell aria-hidden="true" />
                      {value.registeredUntil
                        ? t('地点を更新する', 'Update places')
                        : t('この地点で通知を受け取る', 'Alert me for these places')}
                    </Button>
                    {value.registeredUntil && (
                      <Button variant="outline" onClick={() => void unregister()} disabled={push.busy}>
                        {t('通知を止める', 'Stop alerts')}
                      </Button>
                    )}
                  </div>
                  {push.problem && !notice && (
                    <p className="text-sm text-destructive">{problemText(push.problem, language)}</p>
                  )}
                  <NoticeLine notice={notice} language={language} />
                </Card>
              </div>
            }
            extras={
              <ConditionSection
                id="source"
                title={t('出典', 'Source')}
                summary={t(
                  `${source?.name.ja ?? ''}のオープンデータ（${source?.license.name ?? ''}）を 3 時間ごとに取得。県の公開後に通知するので、出没から数日〜数か月遅れることがあります。`,
                  `${source?.name.en ?? ''} open data (${source?.license.name ?? ''}), fetched every three hours. Alerts wait for the prefecture to publish, which can be days to months after the sighting.`,
                )}
              >
                {source && (
                  <div className="space-y-3 text-sm">
                    <p>{source.attribution}</p>
                    <p className="flex flex-wrap gap-x-4 gap-y-2">
                      <a href={source.datasetUrl} target="_blank" rel="noreferrer">
                        {t('秋田県オープンデータカタログ', 'Akita open data catalogue')}
                      </a>
                      <a href={source.license.url} target="_blank" rel="noreferrer">
                        {source.license.name}
                      </a>
                    </p>
                    <ul className="list-disc space-y-2 pl-5 text-on-surface-variant">
                      <li>
                        {t(
                          `対象は秋田県内のツキノワグマの目撃・痕跡・人身被害で、目撃日時が ${RECENT_DAYS} 日以内のものです。`,
                          `Covers Asian black bear sightings, signs and injuries in Akita dated within ${RECENT_DAYS} days.`,
                        )}
                      </li>
                      <li>{t(`確認日：${source.checkedOn}`, `Checked on ${source.checkedOn}.`)}</li>
                    </ul>
                  </div>
                )}
              </ConditionSection>
            }
          />
        );
      }}
    </ToolFrame>
  );
}
