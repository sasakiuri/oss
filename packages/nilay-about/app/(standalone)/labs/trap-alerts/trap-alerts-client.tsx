'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { LuCopy, LuLink, LuTrash2 } from 'react-icons/lu';
import { z } from 'zod';

import { ConditionSection, ToolLayout } from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { errorKind, ERROR_MESSAGES, sendJson } from '@/features/labs-notify/client';
import { PushSetup } from '@/features/labs-notify/components/push-setup';
import { NoticeLine, ToolFrame, type Notice } from '@/features/labs-notify/components/tool-frame';
import { usePush } from '@/features/labs-notify/use-push';
import { labsTool } from '@/lib/labs-tools';
import type { PushSubscriptionData } from '@/lib/schemas/push';
import { addedHookDeviceSchema, createdHookSchema } from '@/lib/schemas/trap-alerts';
import {
  curlExample,
  HOOK_CALLS_PER_MINUTE,
  HOOK_DEVICES_MAX,
  HOOK_LABEL_MAX_LENGTH,
  HOOK_MESSAGE_MAX_LENGTH,
  HOOK_TTL_DAYS,
  manageFragment,
  readManageFragment,
  type HookCredentials,
} from '@/lib/trap-alerts';
import { useLanguage, type Language } from '@/store';

import { SAVED_HOOKS_MAX, TRAP_ALERTS_STORAGE_KEY, useTrapAlertsStore, type SavedHook } from './_store';

const rehydrate = () => useTrapAlertsStore.persist.rehydrate();
const origin = () => (typeof window === 'undefined' ? '' : window.location.origin);
const hookUrl = (hook: SavedHook) => `${origin()}/api/labs/hooks/${hook.triggerToken}`;
const manageUrl = (hook: SavedHook) => `${origin()}/labs/trap-alerts${manageFragment(hook)}`;

export function TrapAlertsClient() {
  const { value, set } = useTrapAlertsStore();
  const push = usePush();
  const pageLanguage = useLanguage();
  const [label, setLabel] = useState('');
  const [pasted, setPasted] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const renewed = useRef(false);
  const formId = useId();

  const fail = (error: unknown) => setNotice({ error: true, ...ERROR_MESSAGES[errorKind(error)] });
  const keep = (hook: SavedHook) =>
    set({
      hooks: [...useTrapAlertsStore.getState().value.hooks.filter((item) => item.hookId !== hook.hookId), hook].slice(
        -SAVED_HOOKS_MAX,
      ),
    });

  /** Registers this device on a hook, which also renews the hook and its devices. */
  const join = (credentials: HookCredentials, subscription: PushSubscriptionData, language: Language) =>
    sendJson(
      '/api/labs/trap-hooks/devices',
      'POST',
      { hookId: credentials.hookId, manageToken: credentials.manageToken, subscription, language },
      addedHookDeviceSchema,
    ).then((added) => ({ ...credentials, label: added.label, expiresAt: added.expiresAt }));

  // A manage link opened on this device fills in the form below.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (readManageFragment(window.location.hash)) setPasted(window.location.href);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Each visit asks the server about the saved hooks: their expiry may have been extended by calls,
  // and only a hook the server no longer has is forgotten here. With notifications on, the visit
  // also renews the hook together with this device.
  useEffect(() => {
    if (renewed.current || push.support === null || value.hooks.length === 0) return;
    renewed.current = true;
    const subscription = push.subscription;
    void (async () => {
      for (const hook of value.hooks) {
        try {
          keep(
            subscription
              ? await join(hook, subscription, pageLanguage)
              : await sendJson(
                  '/api/labs/trap-hooks/status',
                  'POST',
                  { hookId: hook.hookId, manageToken: hook.manageToken },
                  addedHookDeviceSchema,
                ).then((status) => ({ ...hook, label: status.label, expiresAt: status.expiresAt })),
          );
        } catch (error) {
          if (errorKind(error) === 'notFound') {
            set({ hooks: useTrapAlertsStore.getState().value.hooks.filter((item) => item.hookId !== hook.hookId) });
          }
        }
      }
    })();
    // Runs once the subscription and the saved hooks are known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [push.support, push.subscription, value.hooks.length]);

  const create = async (language: Language) => {
    if (!label.trim()) {
      setNotice({ error: true, ja: '名前を入力してください。', en: 'Enter a name.' });
      return;
    }
    const subscription = push.subscription ?? (await push.enable());
    if (!subscription) return;
    try {
      keep(
        await sendJson(
          '/api/labs/trap-hooks',
          'POST',
          { subscription, language, label: label.trim() },
          createdHookSchema,
        ),
      );
      renewed.current = true;
      setLabel('');
      setNotice({ error: false, ja: '通知用 URL を発行しました。', en: 'Hook URL created.' });
    } catch (error) {
      fail(error);
    }
  };

  const addDevice = async (language: Language) => {
    const credentials = readManageFragment(pasted);
    if (!credentials) {
      setNotice({ error: true, ja: '管理用リンクを貼り付けてください。', en: 'Paste a manage link.' });
      return;
    }
    const subscription = push.subscription ?? (await push.enable());
    if (!subscription) return;
    try {
      keep(await join(credentials, subscription, language));
      setPasted('');
      window.history.replaceState(null, '', window.location.pathname);
      setNotice({
        error: false,
        ja: 'この端末にも通知が届くようにしました。',
        en: 'This device will be notified too.',
      });
    } catch (error) {
      fail(error);
    }
  };

  const remove = async (hook: SavedHook) => {
    try {
      await sendJson(
        '/api/labs/trap-hooks',
        'DELETE',
        { hookId: hook.hookId, manageToken: hook.manageToken },
        z.object({ removed: z.boolean() }),
      );
    } catch (error) {
      if (errorKind(error) !== 'notFound') return fail(error);
    }
    set({ hooks: value.hooks.filter((item) => item.hookId !== hook.hookId) });
    setNotice({ error: false, ja: '通知用 URL を削除しました。', en: 'Hook URL deleted.' });
  };

  const copy = (text: string) =>
    void navigator.clipboard
      ?.writeText(text)
      .then(() => setNotice({ error: false, ja: 'コピーしました。', en: 'Copied.' }));

  return (
    <ToolFrame title={labsTool('trap-alerts').title} storageKey={TRAP_ALERTS_STORAGE_KEY} rehydrate={rehydrate}>
      {(language) => {
        const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
        return (
          <ToolLayout
            resultLabel={t('通知用 URL', 'Hook URLs')}
            primary={
              <div className="space-y-4">
                <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
                  <h2 className="text-xl font-medium">{t('通知用 URL を発行', 'Create a hook URL')}</h2>
                  <div className="space-y-1">
                    <label htmlFor={`${formId}-label`} className="block text-sm font-medium">
                      {t('名前（通知の見出しに表示）', 'Name (shown in the notification)')}
                    </label>
                    <input
                      id={`${formId}-label`}
                      value={label}
                      maxLength={HOOK_LABEL_MAX_LENGTH}
                      placeholder={t('例：沢の箱わな', 'e.g. Creek box trap')}
                      onChange={(e) => setLabel(e.target.value)}
                    />
                  </div>
                  <Button onClick={() => void create(language)} disabled={push.busy}>
                    <LuLink aria-hidden="true" />
                    {t('URL を発行する', 'Create URL')}
                  </Button>
                </Card>
                <Card variant="outlined" className="space-y-3 rounded-md p-5 sm:p-6">
                  <h2 className="text-xl font-medium">{t('別の端末にも通知する', 'Notify another device too')}</h2>
                  <label htmlFor={`${formId}-paste`} className="block text-sm">
                    {t(
                      '管理用リンクをこの端末で開くか、貼り付けます。',
                      'Open or paste the manage link on this device.',
                    )}
                  </label>
                  <input id={`${formId}-paste`} value={pasted} onChange={(e) => setPasted(e.target.value)} />
                  <Button variant="outline" onClick={() => void addDevice(language)} disabled={push.busy}>
                    {t('この端末を追加', 'Add this device')}
                  </Button>
                </Card>
                <NoticeLine notice={notice} language={language} />
              </div>
            }
            result={
              <div className="space-y-4">
                <PushSetup push={push} language={language} />
                <Card variant="outlined" className="space-y-3 rounded-md p-5 sm:p-6">
                  <h2 className="text-xl font-medium">{t('発行した URL', 'Your hook URLs')}</h2>
                  {value.hooks.length === 0 ? (
                    <p className="text-sm text-on-surface-variant">{t('ありません。', 'None yet.')}</p>
                  ) : (
                    <ul className="space-y-3">
                      {value.hooks.map((hook) => (
                        <li key={hook.hookId} className="space-y-2 rounded-sm bg-surface-container p-3 text-sm">
                          <p className="font-medium">{hook.label}</p>
                          <input
                            readOnly
                            aria-label={t(`${hook.label} の URL`, `URL for ${hook.label}`)}
                            value={hookUrl(hook)}
                            onFocus={(e) => e.target.select()}
                          />
                          <p className="break-all font-mono text-xs text-on-surface-variant">
                            {curlExample(hookUrl(hook))}
                          </p>
                          <p className="text-xs text-on-surface-variant">
                            {t(
                              `${new Date(hook.expiresAt).toLocaleDateString('ja-JP')} まで有効`,
                              `Valid until ${new Date(hook.expiresAt).toLocaleDateString('en-GB')}`,
                            )}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <Button variant="outline" onClick={() => copy(hookUrl(hook))}>
                              <LuCopy aria-hidden="true" />
                              {t('URL をコピー', 'Copy URL')}
                            </Button>
                            <Button variant="outline" onClick={() => copy(manageUrl(hook))}>
                              <LuCopy aria-hidden="true" />
                              {t('管理用リンクをコピー', 'Copy manage link')}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() =>
                                window.confirm(
                                  t(
                                    `「${hook.label}」の URL を削除しますか？機器から呼んでも通知されなくなります。`,
                                    `Delete the URL for “${hook.label}”? Calls to it will no longer notify anyone.`,
                                  ),
                                ) && void remove(hook)
                              }
                            >
                              <LuTrash2 aria-hidden="true" />
                              {t('削除', 'Delete')}
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            }
            extras={
              <ConditionSection
                id="how"
                title={t('機器からの呼び出し', 'Calling from a device')}
                summary={t(
                  'URL に POST すると、登録した端末に Web Push で通知します。',
                  'A POST to the URL sends a Web Push to the registered devices.',
                )}
              >
                <ul className="list-disc space-y-2 pl-5 text-sm text-on-surface-variant">
                  <li>
                    {t(
                      `本文は JSON の message・text・value1、フォームの同名の項目、またはテキストのいずれかで、先頭 ${HOOK_MESSAGE_MAX_LENGTH} 文字を通知に表示します。本文がなくても通知します。`,
                      `The message is read from JSON (message, text or value1), a form field of the same names, or plain text; the first ${HOOK_MESSAGE_MAX_LENGTH} characters are shown. A call without one still notifies.`,
                    )}
                  </li>
                  <li>{t('GET では通知しません。', 'GET does not notify.')}</li>
                  <li>
                    {t(
                      '機器に設定する URL では通知しか送れません。端末の追加や削除には管理用リンクを使います。管理用リンクは自分の端末だけに置いてください。',
                      'The URL on a device can only send alerts. Adding devices or deleting the hook takes the manage link; keep it on your own devices.',
                    )}
                  </li>
                  <li>
                    {t(
                      `1 つの URL は 1 分に ${HOOK_CALLS_PER_MINUTE} 回まで、通知先は ${HOOK_DEVICES_MAX} 台までです。通知を受けるか、このページを開くたびに URL と端末の登録が ${HOOK_TTL_DAYS} 日延び、どちらもなければ削除されます。`,
                      `Each URL accepts ${HOOK_CALLS_PER_MINUTE} calls a minute and notifies up to ${HOOK_DEVICES_MAX} devices. Each alert or visit to this page extends the URL and its devices by ${HOOK_TTL_DAYS} days; without either they are deleted.`,
                    )}
                  </li>
                  <li>
                    {t(
                      '応答の JSON は、届いた端末の数（delivered）、今回届かなかった端末の数（failed）、登録端末の数（devices）です。failed が 0 でなければ、少し待って呼び直してください。届いた端末にも再度通知されます。',
                      'The JSON response gives the devices reached (delivered), missed this time (failed) and registered (devices). If failed is not 0, call again after a moment; devices already reached get the alert again.',
                    )}
                  </li>
                  <li>
                    {t(
                      'URL を知っている人は誰でも通知を送れます。漏れたら削除して発行し直してください。サーバーに保存するのは URL と管理用リンクの秘密部分のハッシュ、名前、通知先の端末だけで、受信した本文は保存しません。',
                      'Anyone who knows the URL can send an alert. If it leaks, delete it and create a new one. The server keeps only hashes of the URL’s and manage link’s secrets, the name and the devices to notify; messages are not stored.',
                    )}
                  </li>
                  <li>
                    {t('通知が届かなくても見回りは必要です。', 'Traps still have to be checked when no alert arrives.')}
                  </li>
                </ul>
              </ConditionSection>
            }
          />
        );
      }}
    </ToolFrame>
  );
}
