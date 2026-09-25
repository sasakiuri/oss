'use client';

import { useId, useState } from 'react';
import { LuSave } from 'react-icons/lu';
import type { StoreApi, UseBoundStore } from 'zustand';

import { Button, Card } from '@/components/ui';
import { useStorageStatus } from '@/lib/browser-storage';
import { NAMED_SETTINGS_MAX_COUNT, NAMED_SETTINGS_NAME_MAX_LENGTH } from '@/lib/named-settings';
import type { NamedSettingsResult, NamedSettingsState } from '@/lib/named-settings-store';

type Language = 'ja' | 'en';
type Wording = [ja: string, en: string];

interface NamedSettingsProps<T> {
  language: Language;
  /** A store made by `createNamedSettingsStore`, already rehydrated by the tool. */
  store: UseBoundStore<StoreApi<NamedSettingsState<T>>>;
  /** What the form holds now. The store checks it against the tool's schema before keeping it. */
  current: unknown;
  /** Whether `current` is complete; a half-typed form cannot be saved or written over an entry. */
  valid: boolean;
  /** Puts an entry's settings into the tool's form. */
  onLoad: (settings: T) => void;
  /** The heading and the placeholder, in the tool's own words (“Saved bullets”, “e.g. 168 gr SMK”). */
  heading: Wording;
  placeholder: Wording;
  /** The id of the heading, for the tool's section links. */
  id?: string;
}

/**
 * Save the form under a name, bring a named entry back, rename it, write the current form over it,
 * or delete it (with an undo). Shared by the tools that keep more than one set of inputs.
 */
export function NamedSettings<T>({
  language,
  store,
  current,
  valid,
  onLoad,
  heading,
  placeholder,
  id,
}: NamedSettingsProps<T>) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const formId = useId();
  const entries = store((state) => state.entries);
  const removed = store((state) => state.removed);
  const available = useStorageStatus((state) => state.available);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  // Both wordings, picked at render, so a message follows a language change.
  const [message, setMessage] = useState<Wording | null>(null);

  const say = (result: NamedSettingsResult, done: Wording) => {
    const wording: Record<NamedSettingsResult, Wording> = {
      // A write can fail on a full device, so storage is checked before reporting success.
      saved: useStorageStatus.getState().available
        ? done
        : ['端末に保存できませんでした。', 'Could not save to this device.'],
      'empty-name': ['名前を入力してください。', 'Enter a name.'],
      'long-name': [
        `名前は ${NAMED_SETTINGS_NAME_MAX_LENGTH} 文字以内にしてください。`,
        `Keep the name to ${NAMED_SETTINGS_NAME_MAX_LENGTH} characters.`,
      ],
      'duplicate-name': [
        'この名前は使われています。別の名前にしてください。',
        'That name is already in use. Choose another.',
      ],
      full: [
        `保存できるのは ${NAMED_SETTINGS_MAX_COUNT} 件までです。使わないものを削除してください。`,
        `Up to ${NAMED_SETTINGS_MAX_COUNT} can be kept. Delete one you no longer use.`,
      ],
      'invalid-settings': ['エラーのある欄を直してから保存してください。', 'Correct the fields with errors first.'],
    };
    setMessage(wording[result]);
    return result === 'saved';
  };

  return (
    <Card variant="outlined" className="flex flex-col gap-4 rounded-md p-5 sm:p-6">
      <h2 id={id} className="text-xl font-medium">
        {t(...heading)}
      </h2>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (say(store.getState().save(name, current), ['保存しました。', 'Saved.'])) setName('');
        }}
      >
        <label htmlFor={`${formId}-name`} className="block text-sm font-medium">
          {t('名前', 'Name')}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            id={`${formId}-name`}
            value={name}
            maxLength={NAMED_SETTINGS_NAME_MAX_LENGTH}
            onChange={(event) => setName(event.target.value)}
            placeholder={t(...placeholder)}
            className="min-w-0 flex-1"
          />
          <Button type="submit" variant="secondary" disabled={!valid || !name.trim() || !available}>
            <LuSave aria-hidden="true" />
            {t('保存', 'Save')}
          </Button>
        </div>
      </form>
      {entries.length > 0 && (
        <ul className="divide-y divide-outline-variant border-y border-outline-variant">
          {entries.map((entry) => (
            <li key={entry.id} className="py-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  className="min-w-0 flex-1 justify-start whitespace-normal break-words text-left"
                  onClick={() => {
                    onLoad(entry.settings);
                    setMessage([`「${entry.name}」を読み込みました。`, `Loaded “${entry.name}”.`]);
                  }}
                >
                  {entry.name}
                </Button>
                <Button
                  variant="ghost"
                  aria-expanded={editing === entry.id}
                  aria-label={t(`「${entry.name}」を編集`, `Edit ${entry.name}`)}
                  onClick={() => {
                    setEditing(editing === entry.id ? null : entry.id);
                    setEditName(entry.name);
                  }}
                >
                  {t('編集', 'Edit')}
                </Button>
              </div>
              {editing === entry.id && (
                <div className="space-y-3 p-2">
                  <form
                    className="space-y-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (say(store.getState().rename(entry.id, editName), ['名前を変更しました。', 'Renamed.']))
                        setEditing(null);
                    }}
                  >
                    <label htmlFor={`${formId}-rename-${entry.id}`} className="block text-sm">
                      {t('新しい名前', 'New name')}
                    </label>
                    <input
                      type="text"
                      id={`${formId}-rename-${entry.id}`}
                      value={editName}
                      maxLength={NAMED_SETTINGS_NAME_MAX_LENGTH}
                      onChange={(event) => setEditName(event.target.value)}
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
                        if (say(store.getState().replace(entry.id, current), ['上書きしました。', 'Replaced.']))
                          setEditing(null);
                      }}
                    >
                      {t('現在の入力で上書き', 'Replace with the current inputs')}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        store.getState().remove(entry.id);
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
      {/* Mounted empty, so later text is announced; not atomic, so the undo offer is not read again with each message. */}
      <div role="status" aria-atomic="false" className={removed || message ? 'space-y-2 text-sm' : 'sr-only'}>
        {removed && (
          <div className="flex flex-wrap items-center gap-2">
            <span>{t(`「${removed.entry.name}」を削除しました。`, `Deleted “${removed.entry.name}”.`)}</span>
            <Button
              variant="ghost"
              onClick={() => say(store.getState().undoRemove(), ['元に戻しました。', 'Restored.'])}
            >
              {t('元に戻す', 'Undo')}
            </Button>
          </div>
        )}
        {message && <p>{t(...message)}</p>}
      </div>
    </Card>
  );
}
