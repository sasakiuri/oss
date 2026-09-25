'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { LuCopy, LuLogOut, LuMapPin, LuPause, LuX } from 'react-icons/lu';
import { z } from 'zod';

import { ConditionSection, ToolLayout } from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { errorKind, ERROR_MESSAGES, sendJson } from '@/features/labs-notify/client';
import { NoticeLine, ToolFrame, type Notice } from '@/features/labs-notify/components/tool-frame';
import { requestJson } from '@/lib/http/client';
import { labsTool } from '@/lib/labs-tools';
import {
  compassPoint,
  distanceAndBearing,
  isStale,
  MEMBER_NAME_MAX_LENGTH,
  PASSPHRASE_MAX_LENGTH,
  PASSPHRASE_MIN_LENGTH,
  POLL_INTERVAL_MS,
  readRoomFragment,
  ROOM_HOURS_OPTIONS,
  ROOM_MEMBERS_MAX,
  roomFragment,
} from '@/lib/location-share';
import { membershipSchema, roomViewSchema, type Membership, type RoomView } from '@/lib/schemas/location-share';
import type { Language } from '@/store';

import { LOCATION_SHARE_STORAGE_KEY, useLocationShareStore } from './_store';

const rehydrate = () => useLocationShareStore.persist.rehydrate();
const okSchema = z.object({}).passthrough();

type Position = { latitude: number; longitude: number; accuracy: number };

export function LocationShareClient() {
  const { value, set } = useLocationShareStore();
  const membership = value.membership;
  const [invitedRoom, setInvitedRoom] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [hours, setHours] = useState<number>(8);
  const [sharing, setSharing] = useState(false);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [own, setOwn] = useState<Position | null>(null);
  const [now, setNow] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const latest = useRef<Position | null>(null);
  /** The room's next update, run at once when sharing gets its first position. */
  const updateNow = useRef<(() => void) | null>(null);
  const formId = useId();

  useEffect(() => {
    const timer = window.setTimeout(() => setInvitedRoom(readRoomFragment(window.location.hash)), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const fail = useCallback((error: unknown) => setNotice({ error: true, ...ERROR_MESSAGES[errorKind(error)] }), []);
  const auth = useCallback((m: Membership) => ({ Authorization: `Bearer ${m.memberToken}` }), []);

  const leaveLocally = useCallback(() => {
    set({ membership: null });
    setSharing(false);
    setRoom(null);
  }, [set]);

  // Read the room every few seconds and, while sharing, send the latest position with it.
  useEffect(() => {
    if (!membership) return;
    let stopped = false;
    const tick = async () => {
      setNow(Date.now());
      try {
        // One request per update: sending a position answers with the room.
        const view =
          sharing && latest.current
            ? await sendJson(
                `/api/labs/rooms/${membership.roomId}`,
                'PUT',
                latest.current,
                roomViewSchema,
                auth(membership),
              )
            : await requestJson(`/api/labs/rooms/${membership.roomId}`, roomViewSchema, {
                headers: auth(membership),
                cache: 'no-store',
              });
        if (!stopped) setRoom(view);
      } catch (error) {
        const kind = errorKind(error);
        // The room closed, expired, or this member was removed.
        if (kind === 'notFound' || kind === 'forbidden') {
          leaveLocally();
          setNotice({
            error: true,
            ja: 'ルームが閉じられたか期限が切れました。位置の共有を終了しました。',
            en: 'The room was closed or has expired. Sharing has stopped.',
          });
        }
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), POLL_INTERVAL_MS);
    updateNow.current = () => void tick();
    return () => {
      stopped = true;
      updateNow.current = null;
      window.clearInterval(timer);
    };
  }, [membership, sharing, auth, leaveLocally]);

  // The device's position is read only while sharing is switched on.
  useEffect(() => {
    if (!sharing) return;
    if (!('geolocation' in navigator)) {
      const timer = window.setTimeout(() => {
        setSharing(false);
        setNotice({
          error: true,
          ja: 'この端末では位置を取得できません。',
          en: 'This device cannot read its position.',
        });
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const id = navigator.geolocation.watchPosition(
      (position) => {
        const next = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Math.min(100_000, position.coords.accuracy),
        };
        // The first position after sharing is switched on is sent at once, not at the next update.
        const first = latest.current === null;
        latest.current = next;
        setOwn(next);
        if (first) updateNow.current?.();
      },
      () => {
        setSharing(false);
        setNotice({
          error: true,
          ja: '位置を取得できませんでした。位置情報の許可を確認してください。',
          en: 'Could not read the position. Check the location permission.',
        });
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
    );
    return () => {
      navigator.geolocation.clearWatch(id);
      // A position from before sharing was switched off is never sent after it is switched on again.
      latest.current = null;
    };
  }, [sharing]);

  const enter = async (kind: 'create' | 'join') => {
    try {
      const joined =
        kind === 'create'
          ? await sendJson('/api/labs/rooms', 'POST', { passphrase, name: name.trim(), hours }, membershipSchema)
          : await sendJson(
              `/api/labs/rooms/${invitedRoom ?? ''}/join`,
              'POST',
              { passphrase, name: name.trim() },
              membershipSchema,
            );
      set({ membership: joined });
      setPassphrase('');
      setInvitedRoom(null);
      window.history.replaceState(null, '', window.location.pathname);
    } catch (error) {
      fail(error);
    }
  };

  const exit = async (kind: 'leave' | 'close') => {
    if (!membership) return;
    try {
      if (kind === 'leave')
        await sendJson(`/api/labs/rooms/${membership.roomId}/leave`, 'POST', undefined, okSchema, auth(membership));
      else await sendJson(`/api/labs/rooms/${membership.roomId}`, 'DELETE', undefined, okSchema, auth(membership));
    } catch (error) {
      if (errorKind(error) !== 'notFound') return fail(error);
    }
    leaveLocally();
    setNotice({
      error: false,
      ja:
        kind === 'close' ? 'ルームを閉じ、全員の位置を削除しました。' : 'ルームから退出し、自分の位置を削除しました。',
      en:
        kind === 'close' ? 'Room closed; every position was deleted.' : 'You left the room; your position was deleted.',
    });
  };

  return (
    <ToolFrame title={labsTool('location-share').title} storageKey={LOCATION_SHARE_STORAGE_KEY} rehydrate={rehydrate}>
      {(language) => {
        const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
        const invite =
          membership && typeof window !== 'undefined'
            ? `${window.location.origin}/labs/location-share${roomFragment(membership.roomId)}`
            : '';
        const passwordFields = (
          <>
            <div className="space-y-1">
              <label htmlFor={`${formId}-name`} className="block text-sm font-medium">
                {t('表示名（役割など）', 'Display name (a role, say)')}
              </label>
              <input
                id={`${formId}-name`}
                value={name}
                maxLength={MEMBER_NAME_MAX_LENGTH}
                placeholder={t('例：勢子 1', 'e.g. Beater 1')}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${formId}-pass`} className="block text-sm font-medium">
                {t('合言葉', 'Passphrase')}
              </label>
              <input
                id={`${formId}-pass`}
                type="password"
                autoComplete="off"
                value={passphrase}
                minLength={PASSPHRASE_MIN_LENGTH}
                maxLength={PASSPHRASE_MAX_LENGTH}
                onChange={(e) => setPassphrase(e.target.value)}
              />
              <p className="text-xs text-on-surface-variant">
                {t(
                  `${PASSPHRASE_MIN_LENGTH} 文字以上。リンクとは別に、口頭などで伝えてください。`,
                  `At least ${PASSPHRASE_MIN_LENGTH} characters. Tell it to people separately from the link.`,
                )}
              </p>
            </div>
          </>
        );
        return (
          <ToolLayout
            resultLabel={t('参加者の位置', 'Positions')}
            primary={
              <div className="space-y-4">
                {!membership && invitedRoom && (
                  <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
                    <h2 className="text-xl font-medium">{t('ルームに参加', 'Join the room')}</h2>
                    {passwordFields}
                    <Button onClick={() => void enter('join')}>{t('参加する', 'Join')}</Button>
                  </Card>
                )}
                {!membership && !invitedRoom && (
                  <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
                    <h2 className="text-xl font-medium">{t('ルームを作る', 'Create a room')}</h2>
                    {passwordFields}
                    <div className="space-y-1">
                      <label htmlFor={`${formId}-hours`} className="block text-sm font-medium">
                        {t('ルームの期限', 'Room lasts')}
                      </label>
                      <select id={`${formId}-hours`} value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                        {ROOM_HOURS_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {t(`${option} 時間`, `${option} hours`)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button onClick={() => void enter('create')}>{t('ルームを作る', 'Create room')}</Button>
                  </Card>
                )}
                {membership && (
                  <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
                    <h2 className="text-xl font-medium">{t('参加中のルーム', 'Your room')}</h2>
                    <p className="text-sm">
                      {t(
                        `期限：${new Date(membership.expiresAt).toLocaleString('ja-JP')}（自動的に削除）`,
                        `Ends ${new Date(membership.expiresAt).toLocaleString('en-GB')} (deleted automatically)`,
                      )}
                    </p>
                    <Button className="w-full" size="lg" onClick={() => setSharing((on) => !on)}>
                      {sharing ? <LuPause aria-hidden="true" /> : <LuMapPin aria-hidden="true" />}
                      {sharing
                        ? t('位置の送信を止める', 'Stop sending my position')
                        : t('位置の送信を始める', 'Start sending my position')}
                    </Button>
                    <p className="text-xs text-on-surface-variant" role="status">
                      {sharing
                        ? t(
                            'このページを開いている間、約 5 秒ごとに送ります。画面を消すと止まることがあります。',
                            'Sent about every 5 seconds while this page is open. It may stop when the screen is off.',
                          )
                        : t('位置は送っていません。', 'Your position is not being sent.')}
                    </p>
                    <div className="space-y-2">
                      <label htmlFor={`${formId}-invite`} className="block text-sm font-medium">
                        {t('招待リンク（合言葉は別に伝える）', 'Invitation link (give the passphrase separately)')}
                      </label>
                      <input id={`${formId}-invite`} readOnly value={invite} onFocus={(e) => e.target.select()} />
                      <Button
                        variant="outline"
                        onClick={() =>
                          void navigator.clipboard
                            ?.writeText(invite)
                            .then(() => setNotice({ error: false, ja: 'リンクをコピーしました。', en: 'Link copied.' }))
                        }
                      >
                        <LuCopy aria-hidden="true" />
                        {t('リンクをコピー', 'Copy link')}
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => void exit('leave')}>
                        <LuLogOut aria-hidden="true" />
                        {t('退出する', 'Leave')}
                      </Button>
                      {membership.host && (
                        <Button
                          variant="outline"
                          onClick={() =>
                            window.confirm(
                              t(
                                'ルームを閉じて全員の位置を削除しますか？',
                                'Close the room and delete every position?',
                              ),
                            ) && void exit('close')
                          }
                        >
                          <LuX aria-hidden="true" />
                          {t('ルームを閉じる', 'Close room')}
                        </Button>
                      )}
                    </div>
                  </Card>
                )}
                <NoticeLine notice={notice} language={language} />
              </div>
            }
            result={
              <Card variant="outlined" className="space-y-3 rounded-md p-5 sm:p-6">
                <h2 className="text-xl font-medium">{t('参加者の位置', 'Positions')}</h2>
                {!room ? (
                  <p className="text-sm text-on-surface-variant">
                    {t('ルームに入ると表示されます。', 'Shown once you are in a room.')}
                  </p>
                ) : (
                  <ul className="space-y-2" aria-label={t('参加者', 'Members')}>
                    {room.members.map((member) => (
                      <MemberRow
                        key={member.memberId}
                        member={member}
                        self={member.memberId === membership?.memberId}
                        own={own}
                        now={now}
                        language={language}
                      />
                    ))}
                  </ul>
                )}
              </Card>
            }
            extras={
              <ConditionSection
                id="privacy"
                title={t('位置情報の保存', 'What is stored')}
                summary={t(
                  'サーバーに残すのは各参加者の最新の位置 1 件と表示名だけで、移動の履歴は残しません。ルームは期限（最長 24 時間）で削除されます。',
                  'The server keeps only each member’s latest position and display name, no track. The room is deleted when it ends (24 hours at most).',
                )}
              >
                <ul className="list-disc space-y-2 pl-5 text-sm text-on-surface-variant">
                  <li>
                    {t(
                      '見られるのは、招待リンクと合言葉で参加した人だけです。合言葉はハッシュ化して保存し、参加の試行は 1 分に 5 回までです。',
                      'Only people who joined with the link and passphrase can see positions. The passphrase is stored hashed, and joining is limited to five tries a minute.',
                    )}
                  </li>
                  <li>
                    {t(
                      '「退出する」で自分の表示名と位置を、作成者の「ルームを閉じる」で全員分をすぐに削除します。',
                      '“Leave” deletes your name and position at once; the creator’s “Close room” deletes everyone’s.',
                    )}
                  </li>
                  <li>
                    {t(
                      `1 ルーム ${ROOM_MEMBERS_MAX} 人まで。電波が届かないと、最後に届いた位置のまま止まります。安全確認は無線などと併用してください。`,
                      `Up to ${ROOM_MEMBERS_MAX} members. Without signal, a position stays at the last one received; do not rely on it alone for safety.`,
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

function MemberRow({
  member,
  self,
  own,
  now,
  language,
}: {
  member: RoomView['members'][number];
  self: boolean;
  own: Position | null;
  now: number;
  language: Language;
}) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const position = member.position;
  const seconds = position ? Math.max(0, Math.round((now - position.at) / 1000)) : 0;
  const relative = position && own && !self ? distanceAndBearing({ ...own, at: 0 }, position) : null;
  return (
    <li className="space-y-1 rounded-sm bg-surface-container p-3 text-sm">
      <p className="font-medium">
        {member.name}
        {self && t('（自分）', ' (you)')}
      </p>
      {!position ? (
        <p className="text-on-surface-variant">{t('位置はまだ届いていません', 'No position yet')}</p>
      ) : (
        <>
          {relative && (
            <p className="text-lg">
              {t(
                `${compassPoint(relative.degrees, 'ja')}へ ${Math.round(relative.metres)} m`,
                `${Math.round(relative.metres)} m ${compassPoint(relative.degrees, 'en')}`,
              )}
            </p>
          )}
          <p className={isStale(position, now) ? 'text-destructive' : 'text-on-surface-variant'}>
            {t(`${seconds} 秒前`, `${seconds} s ago`)} ・{' '}
            {t(`誤差 約 ${Math.round(position.accuracy)} m`, `±${Math.round(position.accuracy)} m`)}
            {isStale(position, now) && t('（更新が止まっています）', ' (not updating)')}
          </p>
          <a
            href={`https://maps.gsi.go.jp/#16/${position.latitude.toFixed(6)}/${position.longitude.toFixed(6)}/`}
            target="_blank"
            rel="noreferrer"
          >
            {t('地理院地図で開く', 'Open in GSI Maps')}
          </a>
        </>
      )}
    </li>
  );
}
