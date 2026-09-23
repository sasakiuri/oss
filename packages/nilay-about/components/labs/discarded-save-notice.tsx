'use client';

import { useDiscardedSave } from '@/lib/browser-storage';

export type DiscardedSaveSubject = 'settings' | 'record' | 'settings-shared';

/** One wording for every tool, so the same event never reads as two different problems. */
export function discardedSaveMessage(language: 'ja' | 'en', subject: DiscardedSaveSubject = 'settings'): string {
  if (language === 'ja')
    switch (subject) {
      case 'record':
        return '保存されていた学習記録と設定を読み取れなかったため、初期値で開いています。';
      case 'settings-shared':
        return '保存されていた設定を読み取れなかったため、共有リンクの条件で開いています。';
      default:
        return '保存されていた設定を読み取れなかったため、初期値で開いています。';
    }
  switch (subject) {
    case 'record':
      return 'The saved record and settings could not be read, so this opened with the defaults.';
    case 'settings-shared':
      return 'The saved settings could not be read, so this opened with the shared setup.';
    default:
      return 'The saved settings could not be read, so this opened with the defaults.';
  }
}

interface DiscardedSaveNoticeProps {
  storageKey: string;
  language: 'ja' | 'en';
  subject?: DiscardedSaveSubject;
}

/**
 * The visible half of the notice. Screen readers get it from the tool's own status region instead,
 * because this element carries its text from the moment it mounts and would not be announced here.
 */
export function DiscardedSaveNotice({ storageKey, language, subject }: DiscardedSaveNoticeProps) {
  const discarded = useDiscardedSave(storageKey);
  if (!discarded) return null;
  return <p className="text-sm text-on-surface-variant">{discardedSaveMessage(language, subject)}</p>;
}

/**
 * Said at the top of a tool, not only in its notes: a reader whose browser cannot save has to learn,
 * before typing a load in, that it will be gone next time. The notes are closed by default.
 */
export function StorageUnavailableNotice({ available, language }: { available: boolean; language: 'ja' | 'en' }) {
  if (available) return null;
  // A status, for a browser that stops saving partway through a visit (a full quota).
  return (
    <p role="status" className="text-sm text-on-surface-variant">
      {language === 'ja'
        ? 'このブラウザーでは設定を保存できません。次に開いたときは初期値に戻ります。'
        : 'This browser cannot save settings. The form returns to its defaults next time you open it.'}
    </p>
  );
}
