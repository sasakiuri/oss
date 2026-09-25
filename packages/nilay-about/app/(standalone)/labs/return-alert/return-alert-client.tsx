'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { LuCopy, LuHouse, LuRefreshCw } from 'react-icons/lu';
import { z } from 'zod';

import { ScheduledChecksPaused, ConditionSection, ToolLayout } from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { errorKind, ERROR_MESSAGES, sendJson } from '@/features/labs-notify/client';
import { PushSetup } from '@/features/labs-notify/components/push-setup';
import { NoticeLine, ToolFrame, type Notice } from '@/features/labs-notify/components/tool-frame';
import { usePush } from '@/features/labs-notify/use-push';
import { SaveLockUnavailableError } from '@/lib/browser-storage';
import { HttpError } from '@/lib/http/client';
import { useRecovery } from '@/lib/labs-session';
import { labsTool } from '@/lib/labs-tools';
import {
  CHECK_INTERVAL_MINUTES,
  GRACE_MINUTES_OPTIONS,
  OVERDUE_ALERTS,
  OVERDUE_REPEAT_MINUTES,
  readPlanPrefill,
  readWatchFragment,
  RETURN_MAX_DAYS,
  RETURN_NOTE_MAX_LENGTH,
  watchFragment,
} from '@/lib/return-alert';
import { SCHEDULED_CHECKS_PAUSED } from '@/lib/scheduled-checks';
import { createdReturnPlanSchema, returnPlanViewSchema, type ReturnPlanView } from '@/lib/schemas/return-alert';
import type { Language } from '@/store';

import {
  createAlone,
  followOtherTabs,
  ownIsSaved,
  RETURN_ALERT_STORAGE_KEY,
  useReturnAlertStore,
  withSaved,
  type OwnPlan,
  type Update,
} from './_store';

const planResponseSchema = z.object({ plan: returnPlanViewSchema });
const doneSchema = z.object({ done: z.boolean() });
const rehydrate = () => useReturnAlertStore.persist.rehydrate();

const UNSUPPORTED = {
  ja: 'このブラウザーでは入山計画を保存できません。最新のブラウザーでお試しください。',
  en: 'Plans cannot be kept in this browser. Try an up-to-date browser.',
};

/**
 * While a restore cut short keeps the tools read-only (`labs-session.ts`), nothing this page saves is
 * kept: what an action is for is said, and it is not sent to the server.
 */
const readOnlyNotice = (ja: string, en: string): Notice => ({
  error: true,
  ja: `途中で止まったバックアップの読み込みを解決するまで、${ja}（この端末に保存できないため）。「データの書き出し・読み込み」で解決してください。`,
  en: `Until the interrupted restore is settled, ${en}, as this device cannot save it. Settle it on the Labs data page.`,
});

/** Added to the notice of an action sent while read-only: the device keeps the plan as it was. */
const NOT_SAVED = {
  ja: 'ただし、途中で止まったバックアップの読み込みを解決するまでこの端末には保存できないため、再読み込みすると前の表示に戻ります。',
  en: 'This device cannot save it until the interrupted restore is settled, so a reload shows the plan as it was.',
};

const formatTime = (iso: string, language: Language) =>
  new Date(iso).toLocaleString(language === 'ja' ? 'ja-JP' : 'en-GB', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

function statusText(plan: ReturnPlanView, language: Language) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const time = formatTime(plan.returnAt, language);
  if (plan.status === 'before') return t(`帰着予定 ${time}`, `Due back ${time}`);
  if (plan.status === 'grace') return t(`帰着予定 ${time} を過ぎています（猶予中）`, `Past ${time} (grace period)`);
  return t(`帰着予定 ${time} を過ぎ、見守りの人に通知しています`, `Past ${time}; watchers are being alerted`);
}

export function ReturnAlertClient() {
  const { value } = useReturnAlertStore();
  const push = usePush();
  const [returnAt, setReturnAt] = useState('');
  const [graceMinutes, setGraceMinutes] = useState(30);
  const [note, setNote] = useState('');
  const [invite, setInvite] = useState<{ planId: string; token: string } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const formId = useId();
  const readOnly = useRecovery((state) => state.result === 'failed');

  // The address is read after mount: a watch link's fragment and another tool's prefill.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setInvite(readWatchFragment(window.location.hash));
      const prefill = readPlanPrefill(window.location.search);
      if (prefill.returnAt) setReturnAt(prefill.returnAt);
      if (prefill.note) setNote(prefill.note);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const fail = (error: unknown) =>
    setNotice({
      error: true,
      ...(error instanceof SaveLockUnavailableError ? UNSUPPORTED : ERROR_MESSAGES[errorKind(error)]),
    });

  // Another tab's saves are taken in as they happen. What has expired is removed from the storage
  // under the lock, like every other save.
  useEffect(() => {
    const stop = followOtherTabs();
    withSaved(async ({ update }) => update((saved) => saved)).catch(fail);
    return stop;
  }, []);

  const rearmed = useRef(false);
  const [arming, setArming] = useState(false);

  /** Forgets a plan that was never armed; it told no one and expires on the server by itself. */
  const dropUnarmed = (update: Update, planId: string, ja: string, en: string) => {
    update((saved) => (saved.own?.planId === planId ? { ...saved, own: null } : saved));
    setNotice({ error: true, ja, en });
  };

  /**
   * Arms the saved plan, which schedules it; called holding the saved values' lock. Arming is
   * idempotent, so a page reloaded before the answer arrived simply arms again, and a failed attempt
   * can be repeated. It is armed only once the browser's storage is seen to hold the keys: an armed
   * plan must be one this browser can end. A plan that expired unarmed (after ten minutes), or whose
   * return time passed before it was armed, is dropped, having told no one, and a new one has to be
   * registered.
   */
  const armOwn = async (own: OwnPlan, update: Update) => {
    if (!ownIsSaved(own)) {
      dropUnarmed(
        update,
        own.planId,
        'この端末に計画の鍵を保存できなかったため、登録を完了していません。ブラウザーの保存の設定（プライベートモード、空き容量）を確認して、もう一度登録してください。',
        'The plan’s keys could not be saved on this device, so it was not registered. Check the browser’s storage settings (private mode, free space) and register again.',
      );
      return;
    }
    setArming(true);
    try {
      const { plan } = await sendJson(
        '/api/labs/return-plans/arm',
        'POST',
        { planId: own.planId, token: own.ownerToken },
        planResponseSchema,
      );
      update((saved) =>
        saved.own?.planId === own.planId ? { ...saved, own: { ...saved.own, plan, armed: true } } : saved,
      );
      setNotice({
        error: false,
        ja: '入山計画を登録しました。見守り用リンクを同行者や家族に渡してください。',
        en: 'Plan registered. Send the watch link to your party or family.',
      });
    } catch (error) {
      if (error instanceof HttpError && error.status === 410) {
        dropUnarmed(
          update,
          own.planId,
          '帰着予定を過ぎたため、登録を完了できませんでした。帰着予定を入れ直して登録してください。',
          'The return time has passed, so the plan was not registered. Enter a new return time and register again.',
        );
        return;
      }
      if (errorKind(error) === 'notFound') {
        dropUnarmed(
          update,
          own.planId,
          '登録を完了できませんでした。もう一度登録してください。',
          'The registration could not be completed. Register again.',
        );
        return;
      }
      fail(error);
    } finally {
      setArming(false);
    }
  };

  /** Arms the plan saved now, if it is still the one asked for and not armed yet. */
  const armSaved = async (planId: string) => {
    if (readOnly) {
      setNotice(readOnlyNotice('計画の登録を完了しません', 'the plan’s registration is not completed'));
      return;
    }
    await withSaved(async ({ update }) => {
      const own = useReturnAlertStore.getState().value.own;
      if (own?.planId === planId && !own.armed) await armOwn(own, update);
    }).catch(fail);
  };

  // Set at once on a click, before anything is awaited, so a second click does nothing.
  const creatingNow = useRef(false);
  const [creating, setCreating] = useState(false);

  /**
   * Creates the plan (unarmed), saves its keys, then arms it: one creation at a time across this
   * browser's tabs, and none while a plan is saved, so a second armed plan can never lose its keys.
   */
  const create = async (language: Language) => {
    if (creatingNow.current) return;
    const at = new Date(returnAt);
    if (!returnAt || Number.isNaN(at.getTime())) {
      setNotice({ error: true, ja: '帰着予定の日時を入力してください。', en: 'Enter when you expect to be back.' });
      return;
    }
    creatingNow.current = true;
    setCreating(true);
    try {
      // Asked before the lock, while the click still counts as the reader's own action.
      const subscription = push.subscription ?? (await push.enable());
      if (!subscription) return;
      const outcome = await createAlone(async ({ update }) => {
        let own: OwnPlan;
        try {
          const created = await sendJson(
            '/api/labs/return-plans',
            'POST',
            { subscription, language, returnAt: at.toISOString(), graceMinutes, note: note.trim() },
            createdReturnPlanSchema,
          );
          own = { ...created, armed: false };
          // The keys are kept before the plan is armed (and read back by `armOwn`), so an armed plan
          // always has an owner here. This page arms it next; the reload path below is not needed for it.
          rearmed.current = true;
          update((saved) => ({ ...saved, own }));
        } catch (error) {
          // An unanswered creation is left to expire unarmed; registering again makes a new plan.
          fail(error);
          return;
        }
        await armOwn(own, update);
      });
      if (!outcome.ran) {
        setNotice(
          outcome.reason === 'exists'
            ? {
                error: true,
                ja: 'この端末には登録中の入山計画があります。新しく登録するには、先に帰着するか取り消してください。',
                en: 'This device already has a plan. Press the return or cancel it before registering another.',
              }
            : outcome.reason === 'readOnly'
              ? {
                  error: true,
                  ja: '途中で止まったバックアップの読み込みを解決するまで、この端末に計画の鍵を保存できないため登録しません。',
                  en: 'Until the interrupted restore is settled, this device cannot keep a plan’s keys, so no plan is registered.',
                }
              : { error: true, ...UNSUPPORTED },
        );
      }
    } finally {
      creatingNow.current = false;
      setCreating(false);
    }
  };

  // A plan saved but not yet confirmed as armed (the page was closed in between) is armed now.
  useEffect(() => {
    if (SCHEDULED_CHECKS_PAUSED || rearmed.current || !value.own || value.own.armed) return;
    rearmed.current = true;
    void armSaved(value.own.planId);
    // Runs once the saved plan is known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.own]);

  /** Changes this device's plan in the storage only if it is still the plan the request was for. */
  const changeOwn = (planId: string, change: (own: OwnPlan) => OwnPlan | null) =>
    withSaved(async ({ update }) =>
      update((saved) => (saved.own?.planId === planId ? { ...saved, own: change(saved.own) } : saved)),
    );

  /**
   * The actions on this device's plan. While read-only, a refresh is not sent, since only this device's
   * copy would change; the return, a cancellation and a new return time are, since they are what stops or
   * holds off the alerts to the watchers, and the notice says the device keeps its plan as it was.
   */
  const ownAction = async (action: 'return' | 'cancel' | 'update' | 'status', extra: object = {}) => {
    const own = value.own;
    if (!own) return;
    if (readOnly && action === 'status') {
      setNotice(readOnlyNotice('計画の状態を更新しません', 'the plan’s state is not refreshed'));
      return;
    }
    const done = (result: Notice) =>
      setNotice(
        readOnly ? { ...result, ja: `${result.ja}${NOT_SAVED.ja}`, en: `${result.en} ${NOT_SAVED.en}` } : result,
      );
    const body = { planId: own.planId, token: own.ownerToken, ...extra };
    try {
      if (action === 'return' || action === 'cancel') {
        await sendJson(`/api/labs/return-plans/${action}`, 'POST', body, doneSchema);
        await changeOwn(own.planId, () => null);
        done(
          action === 'return'
            ? {
                error: false,
                ja: 'おかえりなさい。見守りの人に帰着を知らせました。',
                en: 'Welcome back. Your watchers have been told.',
              }
            : { error: false, ja: '入山計画を取り消しました。', en: 'Plan cancelled.' },
        );
        return;
      }
      const { plan } = await sendJson(`/api/labs/return-plans/${action}`, 'POST', body, planResponseSchema);
      await changeOwn(own.planId, (current) => ({ ...current, plan }));
      if (action === 'update') done({ error: false, ja: '帰着予定を変更しました。', en: 'Return time changed.' });
    } catch (error) {
      fail(error);
      // A failure to save the removal is shown in place of the first one.
      if (errorKind(error) === 'notFound') await changeOwn(own.planId, () => null).catch(fail);
    }
  };

  const watch = async (language: Language) => {
    if (!invite) return;
    // The watch is kept only on this device; a watch the server has but this device forgets would alert
    // it with nothing here to show or end it. The link stays in the address for later.
    if (readOnly) {
      setNotice(readOnlyNotice('見守りを登録しません', 'no watch is registered'));
      return;
    }
    const subscription = push.subscription ?? (await push.enable());
    if (!subscription) return;
    try {
      const { plan } = await sendJson(
        '/api/labs/return-plans/watch',
        'POST',
        { ...invite, subscription, language },
        planResponseSchema,
      );
      await withSaved(async ({ update }) =>
        update((saved) => ({
          ...saved,
          watching: [...saved.watching.filter((item) => item.planId !== invite.planId), { ...invite, plan }],
        })),
      );
      setInvite(null);
      window.history.replaceState(null, '', window.location.pathname);
      setNotice({ error: false, ja: '見守りを登録しました。', en: 'You are now watching this plan.' });
    } catch (error) {
      fail(error);
    }
  };

  const refreshWatching = async () => {
    if (readOnly) {
      setNotice(readOnlyNotice('見守っている計画の状態を更新しません', 'the plans you watch are not refreshed'));
      return;
    }
    // What each plan answered: its state, or null when it has ended or expired.
    const answers = new Map<string, ReturnPlanView | null>();
    for (const item of value.watching) {
      try {
        const { plan } = await sendJson(
          '/api/labs/return-plans/status',
          'POST',
          { planId: item.planId, token: item.token },
          planResponseSchema,
        );
        answers.set(item.planId, plan);
      } catch (error) {
        // A plan that has ended or expired is dropped; anything else keeps the last known state.
        if (errorKind(error) === 'notFound') answers.set(item.planId, null);
      }
    }
    await withSaved(async ({ update }) =>
      update((saved) => ({
        ...saved,
        watching: saved.watching.flatMap((item) => {
          if (!answers.has(item.planId)) return [item];
          const plan = answers.get(item.planId);
          return plan ? [{ ...item, plan }] : [];
        }),
      })),
    ).catch(fail);
  };

  return (
    <ToolFrame title={labsTool('return-alert').title} storageKey={RETURN_ALERT_STORAGE_KEY} rehydrate={rehydrate}>
      {(language) => {
        const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
        const own = value.own;
        // Only an armed plan is shared: an unarmed one would tell its watchers nothing.
        const link =
          own?.armed && typeof window !== 'undefined'
            ? `${window.location.origin}/labs/return-alert${watchFragment(own.planId, own.watchToken)}`
            : '';
        return (
          <ToolLayout
            resultLabel={t('見守りの状況', 'Status')}
            primary={
              <div className="space-y-4">
                {invite && (
                  <Card variant="outlined" className="space-y-3 rounded-md p-5 sm:p-6">
                    <h2 className="text-xl font-medium">{t('見守りの依頼', 'Asked to watch')}</h2>
                    <p className="text-sm">
                      {t(
                        '帰着予定を過ぎても「帰着した」が押されないと、この端末に通知が届きます。',
                        'This device is alerted if “I’m back” is not pressed by the time due back.',
                      )}
                    </p>
                    <ScheduledChecksPaused language={language} />
                    <Button onClick={() => void watch(language)} disabled={SCHEDULED_CHECKS_PAUSED || push.busy}>
                      {t('この計画を見守る', 'Watch this plan')}
                    </Button>
                  </Card>
                )}
                {own && !own.armed ? (
                  <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
                    <h2 className="text-xl font-medium">{t('自分の入山計画', 'My plan')}</h2>
                    <p className="text-lg font-medium">{t('未登録', 'Not registered')}</p>
                    <p className="text-sm">
                      {t(
                        '登録を完了するまで、帰着予定を過ぎても誰にも通知されません。',
                        'Until it is registered, no one is alerted if you are late.',
                      )}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <ScheduledChecksPaused language={language} />
                      <Button onClick={() => void armSaved(own.planId)} disabled={SCHEDULED_CHECKS_PAUSED || arming}>
                        {t('登録を完了する', 'Finish registering')}
                      </Button>
                      <Button variant="outline" onClick={() => void ownAction('cancel')} disabled={arming}>
                        {t('登録をやめる', 'Discard')}
                      </Button>
                    </div>
                  </Card>
                ) : own ? (
                  <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
                    <h2 className="text-xl font-medium">{t('自分の入山計画', 'My plan')}</h2>
                    <p className="text-lg font-medium">{statusText(own.plan, language)}</p>
                    {own.plan.note && <p className="text-sm">{own.plan.note}</p>}
                    <p className="text-sm text-on-surface-variant">
                      {t(`見守りの端末：${own.plan.watchers} 台`, `Watching devices: ${own.plan.watchers}`)}
                    </p>
                    <Button className="w-full" size="lg" onClick={() => void ownAction('return')}>
                      <LuHouse aria-hidden="true" />
                      {t('帰着した', 'I’m back')}
                    </Button>
                    <div className="space-y-2">
                      <label htmlFor={`${formId}-link`} className="block text-sm font-medium">
                        {t('見守り用リンク', 'Watch link')}
                      </label>
                      <input id={`${formId}-link`} readOnly value={link} onFocus={(event) => event.target.select()} />
                      <Button
                        variant="outline"
                        onClick={() =>
                          void navigator.clipboard
                            ?.writeText(link)
                            .then(() => setNotice({ error: false, ja: 'リンクをコピーしました。', en: 'Link copied.' }))
                        }
                      >
                        <LuCopy aria-hidden="true" />
                        {t('リンクをコピー', 'Copy link')}
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="space-y-1">
                        <label htmlFor={`${formId}-extend`} className="block text-sm">
                          {t('新しい帰着予定', 'New return time')}
                        </label>
                        <input
                          id={`${formId}-extend`}
                          type="datetime-local"
                          value={returnAt}
                          onChange={(e) => setReturnAt(e.target.value)}
                        />
                      </div>
                      <Button
                        variant="outline"
                        onClick={() =>
                          returnAt && void ownAction('update', { returnAt: new Date(returnAt).toISOString() })
                        }
                      >
                        {t('予定を変更', 'Change time')}
                      </Button>
                      <Button variant="outline" onClick={() => void ownAction('status')}>
                        <LuRefreshCw aria-hidden="true" />
                        {t('状態を更新', 'Refresh')}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          window.confirm(
                            t(
                              '入山計画を取り消しますか？見守りの人に取り消しを通知します。',
                              'Cancel the plan? Your watchers will be told.',
                            ),
                          ) && void ownAction('cancel')
                        }
                      >
                        {t('計画を取り消す', 'Cancel plan')}
                      </Button>
                    </div>
                  </Card>
                ) : (
                  <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
                    <h2 className="text-xl font-medium">{t('入山計画を登録', 'Register a plan')}</h2>
                    <div className="space-y-1">
                      <label htmlFor={`${formId}-at`} className="block text-sm font-medium">
                        {t('帰着予定', 'Expected back')}
                      </label>
                      <input
                        id={`${formId}-at`}
                        type="datetime-local"
                        value={returnAt}
                        onChange={(e) => setReturnAt(e.target.value)}
                      />
                      <p className="text-xs text-on-surface-variant">
                        {t(
                          `${RETURN_MAX_DAYS} 日以内。この端末の時計の時刻です。`,
                          `Within ${RETURN_MAX_DAYS} days, in this device’s time.`,
                        )}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <label htmlFor={`${formId}-grace`} className="block text-sm font-medium">
                        {t('見守りの人に知らせるまでの猶予', 'Grace before watchers are alerted')}
                      </label>
                      <select
                        id={`${formId}-grace`}
                        value={graceMinutes}
                        onChange={(e) => setGraceMinutes(Number(e.target.value))}
                      >
                        {GRACE_MINUTES_OPTIONS.map((minutes) => (
                          <option key={minutes} value={minutes}>
                            {minutes === 0 ? t('なし', 'None') : t(`${minutes} 分`, `${minutes} min`)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label htmlFor={`${formId}-note`} className="block text-sm font-medium">
                        {t('行き先・経路のメモ（任意）', 'Where you are going (optional)')}
                      </label>
                      <textarea
                        id={`${formId}-note`}
                        rows={3}
                        maxLength={RETURN_NOTE_MAX_LENGTH}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder={t(
                          '例：○○林道の終点から北尾根。車は林道ゲート前。',
                          'e.g. North ridge from the end of the forest road; car at the gate.',
                        )}
                      />
                      <p className="text-xs text-on-surface-variant">
                        {t(
                          '見守りの人への通知に表示されます。氏名や電話番号は書かないでください。',
                          'Shown in the alert to your watchers. Do not write names or phone numbers.',
                        )}
                      </p>
                    </div>
                    <ScheduledChecksPaused language={language} />
                    <Button
                      className="w-full"
                      onClick={() => void create(language)}
                      disabled={SCHEDULED_CHECKS_PAUSED || push.busy || creating}
                    >
                      {t('登録して見守り用リンクを作る', 'Register and make a watch link')}
                    </Button>
                  </Card>
                )}
                <NoticeLine notice={notice} language={language} />
              </div>
            }
            result={
              <div className="space-y-4">
                <PushSetup push={push} language={language} />
                <Card variant="outlined" className="space-y-3 rounded-md p-5 sm:p-6">
                  <h2 className="text-xl font-medium">{t('見守っている計画', 'Plans you watch')}</h2>
                  {value.watching.length === 0 ? (
                    <p className="text-sm text-on-surface-variant">{t('ありません。', 'None.')}</p>
                  ) : (
                    <>
                      <ul className="space-y-2">
                        {value.watching.map((item) => (
                          <li key={item.planId} className="rounded-sm bg-surface-container p-3 text-sm">
                            <p className="font-medium">{statusText(item.plan, language)}</p>
                            {item.plan.note && <p>{item.plan.note}</p>}
                          </li>
                        ))}
                      </ul>
                      <Button variant="outline" onClick={() => void refreshWatching()}>
                        <LuRefreshCw aria-hidden="true" />
                        {t('状態を更新', 'Refresh')}
                      </Button>
                    </>
                  )}
                </Card>
              </div>
            }
            extras={
              <ConditionSection
                id="how"
                title={t('通知と保存する情報', 'Alerts and what is stored')}
                summary={t(
                  '帰着予定の時刻に本人へ、猶予を過ぎたら本人と見守りの端末へ Web Push で通知します。メール・SMS・通報は行いません。',
                  'At the return time you are reminded; after the grace period you and your watchers get a Web Push. No email, SMS or emergency call is made.',
                )}
              >
                <ul className="list-disc space-y-2 pl-5 text-sm text-on-surface-variant">
                  <li>
                    {t(
                      `確認は ${CHECK_INTERVAL_MINUTES} 分ごとのため、通知は最大 ${CHECK_INTERVAL_MINUTES} 分ほど遅れます。見守りの人への通知は ${OVERDUE_REPEAT_MINUTES} 分おきに計 ${OVERDUE_ALERTS} 回です。`,
                      `Checks run every ${CHECK_INTERVAL_MINUTES} minutes, so alerts can be that late. Watchers are alerted ${OVERDUE_ALERTS} times, ${OVERDUE_REPEAT_MINUTES} minutes apart.`,
                    )}
                  </li>
                  <li>
                    {t(
                      '通知は届かないこともあります。連絡がないときの動き（電話、警察・消防への通報）を見守りの人と決めておいてください。',
                      'Alerts can fail to arrive. Agree with your watchers what to do if they hear nothing (call you, call the police or fire service).',
                    )}
                  </li>
                  <li>
                    {t(
                      'サーバーに保存するのは帰着予定・猶予・メモと、通知先の端末の識別子だけです。「帰着した」「取り消す」で直ちに削除し、押し忘れても最後の通知から 24 時間で自動的に削除します。',
                      'The server keeps only the return time, grace period, note and the devices to notify. “I’m back” or “Cancel” deletes it at once; otherwise it is deleted 24 hours after the last alert.',
                    )}
                  </li>
                  <li>
                    {t(
                      '見守り用リンクを知っている人は、計画の状態とメモを見られます。',
                      'Anyone with the watch link can see the plan’s status and note.',
                    )}
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
