'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * `good` and `bad` are for a figure that carries a verdict of its own, such as a stability factor
 * that is above or below the value the sources recommend. The wording always has to say the same
 * thing, because colour alone is not read by everyone.
 */
type ResultTone = 'neutral' | 'good' | 'bad';

interface ResultFigureProps {
  label: ReactNode;
  /** The figure itself. `—` while there is nothing to show, so the row keeps its height. */
  value: ReactNode;
  unit?: ReactNode;
  /** The same quantity in other units, or what the figure is telling the reader. */
  note?: ReactNode;
  tone?: ResultTone;
  /** `lead` is the one answer the tool exists to give. At most one per card. */
  size?: 'lead' | 'normal';
}

const toneClass: Record<ResultTone, string> = {
  neutral: 'text-on-surface',
  good: 'text-tertiary',
  bad: 'text-error',
};

/** One figure in a result panel, so the answer outranks the workings that support it. */
export function ResultFigure({ label, value, unit, note, tone = 'neutral', size = 'normal' }: ResultFigureProps) {
  return (
    <div className="min-w-0">
      <p className="text-sm text-on-surface-variant">{label}</p>
      <p
        className={cn(
          'mt-0.5 font-medium tabular-nums',
          size === 'lead' ? 'text-3xl sm:text-4xl' : 'text-2xl',
          toneClass[tone],
        )}
      >
        {value}
        {unit && <span className="ml-1 text-base font-normal text-on-surface-variant">{unit}</span>}
      </p>
      {note && <p className="mt-1 text-sm text-on-surface-variant">{note}</p>}
    </div>
  );
}

/** The surface a set of figures sits on, apart from the fields that produced it. */
export function ResultPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-4 rounded-sm bg-surface-container p-4', className)}>{children}</div>;
}
