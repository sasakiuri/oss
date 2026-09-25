'use client';

import { useEffect, useState } from 'react';
import { LuBell } from 'react-icons/lu';
import { z } from 'zod';

import { ConditionSection, ToolLayout } from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { errorKind, ERROR_MESSAGES, sendJson } from '@/features/labs-notify/client';
import { PushSetup } from '@/features/labs-notify/components/push-setup';
import { NoticeLine, ToolFrame, type Notice } from '@/features/labs-notify/components/tool-frame';
import { usePush } from '@/features/labs-notify/use-push';
import { useRenewal } from '@/features/labs-notify/use-renewal';
import { WATCHED_PAGES } from '@/lib/course-watch';
import { requestJson } from '@/lib/http/client';
import { labsTool } from '@/lib/labs-tools';
import { useLanguage, type Language } from '@/store';

import { COURSE_WATCH_STORAGE_KEY, useCourseWatchStore } from './_store';

const pagesSchema = z.object({ pages: z.array(z.object({ id: z.string(), changedAt: z.string().nullable() })) });
const rehydrate = () => useCourseWatchStore.persist.rehydrate();

export function CourseWatchClient() {
  const { value, set } = useCourseWatchStore();
  const push = usePush();
  const [notice, setNotice] = useState<Notice | null>(null);
  const pageLanguage = useLanguage();

  // Renews the server's record and this device's subscription together on each visit.
  useRenewal(push.subscription, value.registeredUntil !== null, async (subscription) => {
    const { expiresAt } = await sendJson(
      '/api/labs/course-watch',
      'PUT',
      { subscription, language: pageLanguage, pages: value.pages },
      z.object({ expiresAt: z.string() }),
    );
    set({ ...useCourseWatchStore.getState().value, registeredUntil: expiresAt });
  });
  const [changed, setChanged] = useState<Record<string, string | null> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    requestJson('/api/labs/course-watch', pagesSchema, { signal: controller.signal })
      .then((result) => setChanged(Object.fromEntries(result.pages.map((page) => [page.id, page.changedAt]))))
      .catch(() => setChanged(null));
    return () => controller.abort();
  }, []);

  const toggle = (id: (typeof value.pages)[number]) =>
    set({
      ...value,
      pages: value.pages.includes(id) ? value.pages.filter((page) => page !== id) : [...value.pages, id],
    });

  const register = async (language: Language) => {
    const subscription = push.subscription ?? (await push.enable());
    if (!subscription) return;
    try {
      const { expiresAt } = await sendJson(
        '/api/labs/course-watch',
        'PUT',
        { subscription, language, pages: value.pages },
        z.object({ expiresAt: z.string() }),
      );
      set({ ...value, registeredUntil: expiresAt });
      setNotice({ error: false, ja: '更新通知を登録しました。', en: 'Page watch saved.' });
    } catch (error) {
      setNotice({ error: true, ...ERROR_MESSAGES[errorKind(error)] });
    }
  };

  const unregister = async () => {
    try {
      if (push.subscription) {
        await sendJson(
          '/api/labs/course-watch',
          'DELETE',
          { subscription: push.subscription },
          z.object({ removed: z.boolean() }),
        );
      }
      set({ ...value, registeredUntil: null });
      setNotice({ error: false, ja: '更新通知を止めました。', en: 'Page watch stopped.' });
    } catch (error) {
      const kind = errorKind(error);
      if (kind === 'notFound') set({ ...value, registeredUntil: null });
      setNotice({ error: kind !== 'notFound', ...ERROR_MESSAGES[kind] });
    }
  };

  return (
    <ToolFrame title={labsTool('course-watch').title} storageKey={COURSE_WATCH_STORAGE_KEY} rehydrate={rehydrate}>
      {(language) => {
        const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
        return (
          <ToolLayout
            resultLabel={t('通知の登録', 'Registration')}
            primary={
              <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
                <h2 className="text-xl font-medium">{t('確認するページ', 'Pages to watch')}</h2>
                <ul className="space-y-3">
                  {WATCHED_PAGES.map((page) => (
                    <li key={page.id} id={page.id} className="space-y-1 rounded-sm bg-surface-container p-3 text-sm">
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={value.pages.includes(page.id)}
                          onChange={() => toggle(page.id)}
                        />
                        <span>
                          {page.prefecture[language]}・{page.publisher[language]}「{page.title[language]}」
                        </span>
                      </label>
                      <p className="pl-6">
                        <a href={page.url} target="_blank" rel="noreferrer">
                          {t(`${page.publisher.ja}の該当ページを開く`, `Open the page (${page.publisher.en})`)}
                        </a>
                      </p>
                      <p className="pl-6 text-xs text-on-surface-variant">
                        {changed === null
                          ? t(
                              '最終変更の検知日時は取得できませんでした。',
                              'The last detected change could not be read.',
                            )
                          : changed[page.id]
                            ? t(
                                `最後に変更を検知：${new Date(changed[page.id] ?? '').toLocaleString('ja-JP')}`,
                                `Last change detected: ${new Date(changed[page.id] ?? '').toLocaleString('en-GB')}`,
                              )
                            : t('まだ確認していません。', 'Not checked yet.')}
                      </p>
                    </li>
                  ))}
                </ul>
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
                          `登録済み。${new Date(value.registeredUntil).toLocaleDateString('ja-JP')} まで有効です。`,
                          `Registered until ${new Date(value.registeredUntil).toLocaleDateString('en-GB')}.`,
                        )
                      : t('未登録です。', 'Not registered.')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => void register(language)} disabled={push.busy || value.pages.length === 0}>
                      <LuBell aria-hidden="true" />
                      {t('更新を通知する', 'Notify me of changes')}
                    </Button>
                    {value.registeredUntil && (
                      <Button variant="outline" onClick={() => void unregister()} disabled={push.busy}>
                        {t('通知を止める', 'Stop')}
                      </Button>
                    )}
                  </div>
                  <NoticeLine notice={notice} language={language} />
                </Card>
              </div>
            }
            extras={
              <ConditionSection
                id="how"
                title={t('確認の方法', 'How pages are checked')}
                summary={t(
                  '1 日 2 回（7 時・19 時ごろ）取得し、本文が変わったら通知します。本文は転載も保存もしません。',
                  'Fetched twice a day (around 7:00 and 19:00 JST); a change in the main text sends a notification. The text is neither copied nor stored.',
                )}
              >
                <ul className="list-disc space-y-2 pl-5 text-sm text-on-surface-variant">
                  <li>
                    {t('日程以外の文言の変更でも通知します。', 'Wording changes other than dates are reported too.')}
                  </li>
                  {WATCHED_PAGES.map((page) => (
                    <li key={page.id}>
                      <a href={page.policyUrl} target="_blank" rel="noreferrer">
                        {t(`${page.publisher.ja}の利用条件`, `${page.publisher.en}: terms of use`)}
                      </a>
                      {t(`（確認日：${page.checkedOn}）`, ` (checked on ${page.checkedOn})`)}
                    </li>
                  ))}
                </ul>
              </ConditionSection>
            }
          />
        );
      }}
    </ToolFrame>
  );
}
