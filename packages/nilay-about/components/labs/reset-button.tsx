'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { LuRotateCcw } from 'react-icons/lu';

import { Button } from '@/components/ui';
import type { Language } from '@/store';

interface ResetButtonProps {
  language: Language;
  /** What the reader is about to lose, so the dialog names it instead of asking in the abstract. */
  description: { ja: string; en: string };
  onReset: () => void;
}

/**
 * Puts the defaults back.
 *
 * Every tool saves what was typed into it, so without this there is no way back to a clean sheet
 * short of clearing the browser's storage. Typed values cannot be got back once they are gone,
 * so the button asks first.
 */
export function ResetButton({ language, description, onReset }: ResetButtonProps) {
  const [open, setOpen] = useState(false);
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('入力を初期値に戻す', 'Reset to the defaults')}>
          <LuRotateCcw aria-hidden="true" />
        </Button>
      </Dialog.Trigger>
      {/* Deliberately not portalled: the Material tokens live on `.standalone-app`, and `document.body` is outside it. */}
      <Dialog.Overlay className="fixed inset-0 z-40 bg-scrim/60" />
      <Dialog.Content
        lang={language}
        className="fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-xl border border-outline-variant bg-surface p-6 shadow-lg"
      >
        <Dialog.Title className="text-xl font-medium">
          {t('入力を初期値に戻しますか？', 'Reset to the defaults?')}
        </Dialog.Title>
        <Dialog.Description className="text-sm text-on-surface-variant">
          {t(description.ja, description.en)}
        </Dialog.Description>
        <div className="flex flex-wrap justify-end gap-2">
          <Dialog.Close asChild>
            <Button variant="ghost">{t('やめる', 'Cancel')}</Button>
          </Dialog.Close>
          <Button
            variant="destructive"
            onClick={() => {
              onReset();
              setOpen(false);
            }}
          >
            {t('初期値に戻す', 'Reset')}
          </Button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
