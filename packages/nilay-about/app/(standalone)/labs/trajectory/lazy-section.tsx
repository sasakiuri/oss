'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { LuChevronDown } from 'react-icons/lu';

import { cn } from '@/lib/utils';

interface LazySectionProps {
  id: string;
  title: string;
  summary?: string;
  children: ReactNode;
  className?: string;
}

/**
 * A section of the ballistic calculator that works out nothing until it is opened.
 *
 * The reticle, the turret tape, the hit probability and the load comparison each fly the load
 * again, and most readers use one of them at a time. Unlike the shared condition sections, the
 * content is unmounted while closed so a keystroke in the form does not pay for all four; every
 * value is held in the store, so closing a section loses nothing that was typed.
 */
export function LazySection({ id, title, summary, children, className }: LazySectionProps) {
  const [open, setOpen] = useState(false);
  const contentId = useId();

  useEffect(() => {
    // The section links in the page's navigation point here and have to find it open.
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
    <section id={id} className={cn('min-w-0 rounded-md border border-outline-variant bg-surface', className)}>
      <h2 className="text-xl font-medium">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((value) => !value)}
          className="!flex w-full items-center gap-3 rounded-md !px-5 !py-4 text-left !text-xl font-medium sm:!px-6"
        >
          <span className="min-w-0 flex-1">
            <span className="block">{title}</span>
            {summary && <span className="mt-1 block text-sm font-normal text-on-surface-variant">{summary}</span>}
          </span>
          <LuChevronDown
            aria-hidden="true"
            className={cn('size-6 shrink-0 text-on-surface-variant transition-transform', open && 'rotate-180')}
          />
        </button>
      </h2>
      <div id={contentId} className="space-y-5 px-5 pb-5 sm:px-6 sm:pb-6" hidden={!open}>
        {open && children}
      </div>
    </section>
  );
}
