'use client';

import * as Dialog from '@radix-ui/react-dialog';
import Image from 'next/image';
import { useState } from 'react';
import { LuMaximize, LuX } from 'react-icons/lu';

import { Button } from '@/components/ui';
import type { Quiz } from '@/features/game-species/quiz-data';
import type { Language } from '@/store';

const frameClass =
  'relative mx-4 mt-4 h-[min(36dvh,360px)] rounded-md bg-surface-container sm:mx-6 sm:h-[min(44dvh,400px)]';

/** The empty photo area shown before the first photo is drawn. */
export const SpeciesImageFrame = () => <div className={frameClass} aria-hidden="true" />;

export function SpeciesImage({
  quiz,
  showingAnswer,
  language,
  onOpen,
}: {
  quiz: Quiz;
  showingAnswer: boolean;
  language: Language;
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const alt = showingAnswer ? quiz.answer : t('出題中の鳥獣', 'Species to identify');
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) onOpen?.();
      }}
    >
      <figure className={frameClass}>
        <Image
          src={quiz.image}
          alt={alt}
          fill
          className="object-contain p-2"
          sizes="(min-width: 1024px) 680px, 100vw"
          priority
        />
        <Dialog.Trigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="absolute bottom-2 right-2 bg-surface"
            aria-label={t('画像を拡大', 'Enlarge photo')}
          >
            <LuMaximize aria-hidden="true" />
          </Button>
        </Dialog.Trigger>
      </figure>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
      <Dialog.Content
        className="fixed inset-3 z-50 flex flex-col rounded-md bg-surface p-4 shadow-lg sm:inset-8"
        aria-describedby={undefined}
      >
        <div className="flex items-center justify-between gap-3">
          <Dialog.Title className="font-medium" lang={showingAnswer ? 'ja' : language}>
            {alt}
          </Dialog.Title>
          <Dialog.Close asChild>
            <Button variant="ghost" size="icon" aria-label={t('拡大画像を閉じる', 'Close enlarged photo')}>
              <LuX aria-hidden="true" />
            </Button>
          </Dialog.Close>
        </div>
        <div className="relative min-h-0 flex-1">
          <Image src={quiz.image} alt={alt} fill className="object-contain" sizes="100vw" />
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
