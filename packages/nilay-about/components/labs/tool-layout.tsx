'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface ToolLayoutProps {
  /** The few inputs the tool is opened to change. */
  primary: ReactNode;
  /** The answer, and only as much of the workings as it takes to trust it. */
  result: ReactNode;
  /** Conditions most readers leave alone, usually in closed `ConditionSection`s. */
  secondary?: ReactNode;
  /** Whatever comes after the answer: a full table, a print sheet, the notes. Full width. */
  extras?: ReactNode;
  /** Read out for the result column, which scrolls on its own when it is taller than the screen. */
  resultLabel: string;
  /**
   * `workspace` gives the inputs three fifths of a wide screen, for a tool whose input is a photo to
   * tap on: at half the width the photo was too small to place a point on with any precision.
   */
  proportions?: 'even' | 'workspace';
  className?: string;
}

/**
 * Inputs beside their answer.
 *
 * On a phone the page runs primary inputs, answer, the other conditions, then the extras, so the
 * answer sits straight under the numbers a reader changes. On a wide screen the inputs take the
 * left column and the answer stays in view on the right while they are edited. It is sticky within
 * its own column, not fixed over the page, so it never covers a control.
 */
export function ToolLayout({
  primary,
  result,
  secondary,
  extras,
  resultLabel,
  proportions = 'even',
  className,
}: ToolLayoutProps) {
  return (
    <div className={cn('space-y-6', className)}>
      {/* Its own grid, so the sticky answer stops at the end of the inputs instead of riding on
          over the extras below: a sticky box is held inside its parent, not its grid area. */}
      {/* The first row holds only the primary inputs, so an answer taller than them leaves its extra
          height after the secondary conditions rather than between the two. */}
      <div
        className={cn(
          'grid items-start gap-6 lg:grid-rows-[auto_1fr]',
          proportions === 'workspace' ? 'lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]' : 'lg:grid-cols-2',
        )}
      >
        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1">{primary}</div>
        <section
          aria-label={resultLabel}
          // Focusable, because on a wide screen a long answer scrolls inside its column and a
          // keyboard can only scroll what it can reach.
          tabIndex={0}
          // The top clears the app bar and the jump links, which AppLayout measures.
          className="min-w-0 space-y-6 lg:sticky lg:top-[calc(var(--labs-bar-height,4rem)+1.5rem)] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-h-[calc(100dvh-var(--labs-bar-height,4rem)-3rem)] lg:overflow-y-auto lg:overscroll-contain"
        >
          {result}
        </section>
        {secondary && <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-2">{secondary}</div>}
      </div>
      {extras}
    </div>
  );
}
