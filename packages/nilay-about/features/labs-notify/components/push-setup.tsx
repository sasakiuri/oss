'use client';

import { useState } from 'react';
import { LuBell, LuBellOff, LuSend } from 'react-icons/lu';

import { Button, Card } from '@/components/ui';
import { PUSH_SUBSCRIPTION_TTL_DAYS } from '@/lib/schemas/push';
import type { Language } from '@/store';

import { ERROR_MESSAGES } from '../client';
import type { PushProblem, PushState } from '../use-push';

export function problemText(problem: PushProblem, language: Language): string {
  const extra: Record<'denied' | 'unsupported' | 'insecure', { ja: string; en: string }> = {
    denied: {
      ja: '通知が許可されていません。ブラウザーのサイト設定で通知を許可してから、もう一度お試しください。',
      en: 'Notifications are blocked. Allow them in the browser’s site settings and try again.',
    },
    unsupported: {
      ja: 'このブラウザーは Web Push に対応していません。iPhone・iPad では、Safari の共有メニューから「ホーム画面に追加」したアプリで開いてください（iOS 16.4 以降）。',
      en: 'This browser does not support Web Push. On iPhone or iPad, add the site to the Home Screen from Safari’s share menu and open it from there (iOS 16.4 or later).',
    },
    insecure: {
      ja: '通知は HTTPS のページでのみ使えます。',
      en: 'Notifications work only on an HTTPS page.',
    },
  };
  const text =
    problem in extra ? extra[problem as keyof typeof extra] : ERROR_MESSAGES[problem as keyof typeof ERROR_MESSAGES];
  return text[language];
}

/** This device's notification switch, shared by every Labs tool that sends pushes. */
export function PushSetup({ push, language }: { push: PushState; language: Language }) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const [tested, setTested] = useState<boolean | null>(null);

  return (
    <Card variant="outlined" className="space-y-3 rounded-md p-5 sm:p-6">
      <h2 className="text-xl font-medium">{t('この端末への通知', 'Notifications on this device')}</h2>
      <p className="text-sm" role="status">
        {push.support === null
          ? ''
          : push.subscription
            ? t('この端末は通知を受け取れる状態です。', 'This device can receive notifications.')
            : t('この端末ではまだ通知を許可していません。', 'Notifications are not yet turned on for this device.')}
      </p>
      <div className="flex flex-wrap gap-2">
        {!push.subscription ? (
          <Button onClick={() => void push.enable()} disabled={push.busy}>
            <LuBell aria-hidden="true" />
            {t('通知を許可する', 'Turn on notifications')}
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              disabled={push.busy}
              onClick={() => void push.test().then((sent) => setTested(sent))}
            >
              <LuSend aria-hidden="true" />
              {t('テスト通知を送る', 'Send a test')}
            </Button>
            <Button
              variant="outline"
              disabled={push.busy}
              onClick={() => {
                if (
                  window.confirm(
                    t(
                      'この端末へのすべての Labs の通知を止め、サーバーの登録（購読とクマ・講習会の登録）を削除しますか？',
                      'Stop every Labs notification to this device and delete its registration on the server (subscription, bear places and course pages)?',
                    ),
                  )
                )
                  void push.disable();
              }}
            >
              <LuBellOff aria-hidden="true" />
              {t('この端末の通知をすべて止める', 'Stop all notifications here')}
            </Button>
          </>
        )}
      </div>
      {tested !== null && (
        <p className="text-sm" role="status">
          {tested
            ? t(
                'テスト通知を送りました。届かない場合は端末の通知設定を確認してください。',
                'Test sent. If it does not arrive, check the device’s notification settings.',
              )
            : t('テスト通知を送れませんでした。', 'The test could not be sent.')}
        </p>
      )}
      {push.problem && (
        <p className="rounded-sm bg-error-container p-3 text-sm text-on-error-container" role="alert">
          {problemText(push.problem, language)}
        </p>
      )}
      <p className="text-xs text-on-surface-variant">
        {t(
          `サーバーに保存するのは通知の送り先（ブラウザーのプッシュサービスの URL と暗号鍵）と表示言語で、最後の登録から ${PUSH_SUBSCRIPTION_TTL_DAYS} 日で削除します。登録し直すと期限が延びます。電池の節約設定や電波の状況で、通知が遅れたり届かなかったりします。`,
          `The server stores where to send notifications (the browser push service’s URL and keys) and your language, and deletes them ${PUSH_SUBSCRIPTION_TTL_DAYS} days after the last registration. Registering again extends this. Battery saving and poor signal can delay or drop notifications.`,
        )}
      </p>
    </Card>
  );
}
