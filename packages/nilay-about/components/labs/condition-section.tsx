'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { LuChevronDown } from 'react-icons/lu';

import { cn } from '@/lib/utils';

interface ConditionSectionProps {
  /** The section's id, for a jump link or a fragment. Arriving at it opens the section. */
  id: string;
  title: ReactNode;
  /** The values in force, in one line, so a closed section still says what it is assuming. */
  summary: ReactNode;
  children: ReactNode;
  /** Kept open while something inside needs the reader: a field marked as wrong cannot be hidden. */
  forceOpen?: boolean;
  defaultOpen?: boolean;
  className?: string;
}

/**
 * Conditions most readers leave at their defaults: the air, the wind, how a table is laid out.
 * Closed, the section still states the values it is using.
 */
export function ConditionSection({
  id,
  title,
  summary,
  children,
  forceOpen = false,
  defaultOpen = false,
  className,
}: ConditionSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  const expanded = open || forceOpen;

  // Once a wrong value has opened the section, it stays open after the value is put right: closing
  // under the reader's cursor would drop the focus out of the field they have just fixed.
  if (forceOpen && !open) setOpen(true);

  useEffect(() => {
    // A jump link or a shared URL that points into the section has to find it open, and so does
    // the same link followed a second time, which changes no hash.
    const openOnArrival = () => {
      if (window.location.hash === `#${id}`) setOpen(true);
    };
    const openOnLink = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (link?.getAttribute('href')?.endsWith(`#${id}`)) setOpen(true);
    };
    openOnArrival();
    window.addEventListener('hashchange', openOnArrival);
    document.addEventListener('click', openOnLink);
    return () => {
      window.removeEventListener('hashchange', openOnArrival);
      document.removeEventListener('click', openOnLink);
    };
  }, [id]);

  return (
    <section id={id} className={cn('rounded-md border border-outline-variant bg-surface', className)}>
      <h2 className="text-xl font-medium">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          // Still focusable while a wrong value holds it open, so the heading stays in the tab order.
          aria-disabled={forceOpen || undefined}
          onClick={() => {
            if (!forceOpen) setOpen((value) => !value);
          }}
          className="!flex w-full items-center gap-3 rounded-md !px-5 !py-4 text-left !text-xl font-medium aria-disabled:!cursor-default sm:!px-6"
        >
          <span className="min-w-0 flex-1">
            <span className="block">{title}</span>
            <span className="mt-1 block text-sm font-normal text-on-surface-variant">{summary}</span>
          </span>
          <LuChevronDown
            aria-hidden="true"
            className={cn(
              'size-6 shrink-0 text-on-surface-variant transition-transform print:hidden',
              expanded && 'rotate-180',
            )}
          />
        </button>
      </h2>
      {/* Hidden rather than unmounted, so a half-typed field keeps what was typed. A printed page
          shows every condition, open or not, because paper cannot be opened. */}
      <div id={contentId} hidden={!expanded} className="space-y-5 px-5 pb-5 sm:px-6 sm:pb-6 print:!block">
        {children}
      </div>
    </section>
  );
}
