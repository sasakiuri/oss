'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { LuArrowLeft } from 'react-icons/lu';

import { cn } from '@/lib/utils';
import { useLanguage } from '@/store';

interface AppHeaderProps {
  title: string;
  actions?: ReactNode;
  /**
   * Goes on the bar itself, for a tool that hides its own screen while printing. The sticky block
   * around the bar belongs to the layout and is shared with the jump links, so a tool cannot reach
   * it: `print:hidden` has to arrive here instead.
   */
  className?: string;
}

export function AppHeader({ title, actions, className }: AppHeaderProps) {
  const language = useLanguage();

  return (
    // Pinned by the layout, together with any jump links, so that the way back, the language and
    // the reset stay reachable: these pages run to several screens.
    <header className={cn('border-b border-outline-variant bg-surface', className)}>
      <div className="mx-auto flex min-h-16 max-w-6xl items-center gap-3 px-4 py-2 sm:px-8">
        <Link
          href="/labs"
          // The only name this link has is read aloud, so it is said in the language of the page.
          aria-label={language === 'ja' ? 'Labs 一覧に戻る' : 'Back to the list of tools'}
          className="flex size-12 shrink-0 items-center justify-center rounded-full hover:bg-surface-container"
        >
          <LuArrowLeft className="size-5" aria-hidden="true" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-medium leading-snug sm:text-2xl">{title}</h1>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
