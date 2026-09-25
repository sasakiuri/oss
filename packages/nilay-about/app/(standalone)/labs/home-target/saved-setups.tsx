'use client';

import { useState } from 'react';
import { LuLink, LuSave } from 'react-icons/lu';

import { Button, Card } from '@/components/ui';
import { useStorageStatus } from '@/lib/browser-storage';
import { useLanguage } from '@/store';

import { targetSettingsSchema, useHomeTargetStore } from './_store';
import { createSettingsHash } from './share';

export function SavedSetups() {
  const state = useHomeTargetStore();
  const {
    profiles,
    deletedProfile,
    saveProfile,
    loadProfile,
    updateProfile,
    renameProfile,
    deleteProfile,
    undoDelete,
  } = state;
  const language = useLanguage();
  const available = useStorageStatus((s) => s.available);
  const settings = targetSettingsSchema.safeParse(state);
  const valid = settings.success;
  // What a link would encode now; an offered link is shown only while it still matches.
  const currentHash = settings.success ? createSettingsHash(settings.data) : null;
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  // Both wordings, picked at render, so the message follows a language change.
  const [message, setMessage] = useState<[ja: string, en: string] | null>(null);
  const [shareLink, setShareLink] = useState<{ href: string; hash: string } | null>(null);
  const offeringLink = shareLink !== null && shareLink.hash === currentHash;
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  // A write can fail on a full device, so check storage before reporting success.
  const storedMessage = (done: [string, string]): [string, string] =>
    useStorageStatus.getState().available ? done : ['端末に保存できませんでした。', 'Could not save to this device.'];
  const savedMessage = (): [string, string] => storedMessage(['保存しました。', 'Saved.']);

  return (
    <Card variant="outlined" className="flex flex-col gap-4 rounded-md p-5 sm:p-6">
      <h2 id="saved-setups" className="text-xl font-medium">
        {t('保存した設定', 'Saved setups')}
      </h2>
      <p className="text-sm text-on-surface-variant" role="status">
        {available
          ? ''
          : t(
              'このブラウザーでは保存できません。条件は共有リンクで残せます。',
              'This browser cannot save settings. Keep your setup with a share link.',
            )}
      </p>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!saveProfile(name)) {
            setMessage([
              'この設定名は使われています。別の名前にしてください。',
              'That name is already in use. Choose another.',
            ]);
            return;
          }
          setName('');
          setMessage(savedMessage());
        }}
      >
        <label htmlFor="profile-name" className="block text-sm font-medium">
          {t('設定名', 'Setup name')}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('例：自宅', 'e.g. Home')}
            className="min-w-0 flex-1"
          />
          <Button type="submit" variant="secondary" disabled={!valid || !name.trim() || !available}>
            <LuSave aria-hidden="true" />
            {t('保存', 'Save')}
          </Button>
        </div>
      </form>
      {profiles.length > 0 && (
        <ul className="divide-y divide-outline-variant border-y border-outline-variant">
          {profiles.map((profile) => (
            <li key={profile.id} className="py-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  className="min-w-0 flex-1 justify-start whitespace-normal break-words text-left"
                  onClick={() => {
                    loadProfile(profile.id);
                    setMessage([`「${profile.name}」を読み込みました。`, `Loaded “${profile.name}”.`]);
                  }}
                >
                  {profile.name}
                </Button>
                <Button
                  variant="ghost"
                  aria-expanded={editing === profile.id}
                  aria-label={t(`「${profile.name}」を編集`, `Edit ${profile.name}`)}
                  onClick={() => {
                    setEditing(editing === profile.id ? null : profile.id);
                    setEditName(profile.name);
                  }}
                >
                  {t('編集', 'Edit')}
                </Button>
              </div>
              {editing === profile.id && (
                <div className="space-y-3 p-2">
                  <form
                    className="space-y-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!renameProfile(profile.id, editName)) {
                        setMessage(['別の設定名を入力してください。', 'Enter a different setup name.']);
                        return;
                      }
                      setEditing(null);
                      setMessage(savedMessage());
                    }}
                  >
                    <label htmlFor={`rename-${profile.id}`} className="block text-sm">
                      {t('新しい設定名', 'New setup name')}
                    </label>
                    <input
                      type="text"
                      id={`rename-${profile.id}`}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                    <Button variant="outline" type="submit" disabled={!available || !editName.trim()}>
                      {t('名前を変更', 'Rename')}
                    </Button>
                  </form>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      disabled={!valid || !available}
                      onClick={() => {
                        if (updateProfile(profile.id)) {
                          setEditing(null);
                          setMessage(savedMessage());
                        }
                      }}
                    >
                      {t('現在の条件で上書き', 'Replace with current settings')}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        deleteProfile(profile.id);
                        setEditing(null);
                        setMessage(null);
                      }}
                    >
                      {t('削除', 'Delete')}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-outline-variant pt-4">
        <Button
          variant="outline"
          disabled={!valid}
          onClick={async () => {
            if (currentHash === null) return;
            const url = new URL(window.location.href);
            url.hash = currentHash;
            try {
              await navigator.clipboard.writeText(url.href);
              setShareLink(null);
              setMessage(['共有リンクをコピーしました。', 'Share link copied.']);
            } catch {
              setShareLink({ href: url.href, hash: currentHash });
              // The copy instruction below replaces any earlier message.
              setMessage(null);
            }
          }}
        >
          <LuLink aria-hidden="true" />
          {t('条件の共有リンクをコピー', 'Copy setup link')}
        </Button>
        <p className="mt-2 text-xs text-on-surface-variant">
          {t('設定名は含みません。', 'The setup name is not included.')}
        </p>
      </div>
      {/* One region, mounted empty so later text is announced. Not atomic, so the undo offer and
          the copy instruction are not read out again with each message. */}
      <div
        role="status"
        aria-atomic="false"
        className={deletedProfile || message || offeringLink ? 'space-y-2 text-sm' : 'sr-only'}
      >
        {deletedProfile && (
          <div className="flex flex-wrap items-center gap-2">
            <span>
              {t(`「${deletedProfile.profile.name}」を削除しました。`, `Deleted “${deletedProfile.profile.name}”.`)}
            </span>
            <Button
              variant="ghost"
              onClick={() => {
                undoDelete();
                setMessage(storedMessage(['元に戻しました。', 'Restored.']));
              }}
            >
              {t('元に戻す', 'Undo')}
            </Button>
          </div>
        )}
        {/* Tied to the field, so it disappears with it. */}
        {offeringLink && <p>{t('下のリンクを選択してコピーしてください。', 'Select and copy the link below.')}</p>}
        {message && <p>{t(...message)}</p>}
      </div>
      {offeringLink && (
        <label className="block space-y-2 text-sm">
          {t('共有リンク', 'Share link')}
          <input type="text" readOnly value={shareLink.href} onFocus={(e) => e.target.select()} />
        </label>
      )}
    </Card>
  );
}
