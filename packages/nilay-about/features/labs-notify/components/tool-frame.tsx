'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { AppHeader, AppLayout, LanguageMenu } from '@/components/labs';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { cn } from '@/lib/utils';
import { rehydrateLanguage, useLanguage, useSetLanguage, type Language } from '@/store';

/** A result line that is announced, in both wordings so a language switch follows it. */
export type Notice = { error: boolean; ja: string; en: string };

export function NoticeLine({ notice, language }: { notice: Notice | null; language: Language }) {
  return (
    <p
      role="status"
      aria-live={notice?.error ? 'assertive' : 'polite'}
      className={
        notice
          ? cn(
              'rounded-sm p-3 text-sm',
              notice.error ? 'bg-error-container text-on-error-container' : 'bg-surface-container',
            )
          : 'sr-only'
      }
    >
      {notice ? (language === 'ja' ? notice.ja : notice.en) : ''}
    </p>
  );
}

/**
 * The bar, language and hydration shared by the server-backed tools: the page stays inert until the
 * saved values and the language have been read, as every Labs tool does.
 */
export function ToolFrame({
  title,
  storageKey,
  rehydrate,
  children,
}: {
  title: { ja: string; en: string };
  storageKey?: string;
  rehydrate?: () => Promise<void> | void;
  children: (language: Language) => ReactNode;
}) {
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const [ready, setReady] = useState(false);
  const storageAvailable = useStorageStatus((state) => state.available);
  const discarded = useDiscardedSave(storageKey ?? '');

  useEffect(() => {
    void Promise.all([rehydrate?.(), rehydrateLanguage()]).then(() => setReady(true));
  }, [rehydrate]);

  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  return (
    <AppLayout
      header={
        <AppHeader
          title={title[language]}
          actions={<LanguageMenu language={language} onLanguageChange={setLanguage} />}
        />
      }
    >
      <p className="sr-only" role="status" lang={language}>
        {storageKey && discarded
          ? t(
              '保存されていた登録を読み取れなかったため、空の状態で開いています。',
              'The saved registration could not be read, so the page opened empty.',
            )
          : ''}
      </p>
      <div lang={language} className="space-y-6" inert={!ready} aria-busy={!ready}>
        {storageKey && discarded && (
          <p className="text-sm text-on-surface-variant">
            {t(
              '保存されていた登録を読み取れなかったため、空の状態で開いています。',
              'The saved registration could not be read, so the page opened empty.',
            )}
          </p>
        )}
        {storageKey && !storageAvailable && (
          <p className="text-sm text-on-surface-variant">
            {t(
              'このブラウザーでは保存できません。ページを離れると、この端末に控えた合言葉や URL が消えます。',
              'This browser cannot save. Keys and links kept on this device are lost when you leave the page.',
            )}
          </p>
        )}
        {children(language)}
      </div>
    </AppLayout>
  );
}
