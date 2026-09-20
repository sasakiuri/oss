'use client';

import { ChevronDown, List } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import type { TocItem } from '@/lib/content/types';
import { focusContent } from '@/lib/focus-content';
import { cn } from '@/lib/utils';

export function TableOfContents({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const listId = useId();
  const navRef = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const activeItem = items.find((item) => item.id === activeId);

  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;
    const updateHeight = () => {
      document.documentElement.style.setProperty('--article-toc-height', `${button.getBoundingClientRect().height}px`);
    };
    const observer = new ResizeObserver(updateHeight);
    observer.observe(button);
    updateHeight();
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--article-toc-height');
    };
  }, []);

  useEffect(() => {
    const headings = items.flatMap(({ id }) => {
      const heading = document.getElementById(id);
      return heading ? [heading] : [];
    });
    const firstHeading = headings[0];
    if (!firstHeading) return;

    let frame = 0;
    const updateActiveHeading = () => {
      frame = 0;
      const nav = navRef.current;
      if (nav) {
        const availableHeight = Math.max(0, window.innerHeight - nav.getBoundingClientRect().bottom - 24);
        nav.style.setProperty('--toc-available-height', `${availableHeight}px`);
      }
      const offset = parseFloat(getComputedStyle(firstHeading).scrollMarginTop) || 0;
      const atBottom =
        window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1;
      let currentId: string | null = null;
      for (const heading of headings) {
        if (heading.getClientRects().length === 0) continue;
        if (!atBottom && heading.getBoundingClientRect().top > offset + 1) break;
        currentId = heading.id;
      }
      setActiveId(currentId);
    };
    const scheduleUpdate = () => {
      if (!frame) frame = requestAnimationFrame(updateActiveHeading);
    };

    // Recalculate after layout shifts as well as scrolling and fragment navigation.
    const observer = new ResizeObserver(scheduleUpdate);
    const article = firstHeading.closest('article');
    if (article) observer.observe(article);
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('hashchange', scheduleUpdate);
    scheduleUpdate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('hashchange', scheduleUpdate);
    };
  }, [items]);

  useEffect(() => {
    const list = listRef.current;
    const link = list?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!list || !link || list.clientHeight === 0) return;

    // Scroll only the TOC; scrollIntoView would also move the article.
    const bounds = list.getBoundingClientRect();
    const target = link.getBoundingClientRect();
    if (target.top < bounds.top) list.scrollTop += target.top - bounds.top;
    else if (target.bottom > bounds.bottom) list.scrollTop += target.bottom - bounds.bottom;
  }, [activeId, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !navRef.current?.contains(document.activeElement)) return;
      setIsOpen(false);
      buttonRef.current?.focus();
    };
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !navRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOutside);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOutside);
    };
  }, [isOpen]);

  if (items.length === 0) return null;

  return (
    <nav
      ref={navRef}
      aria-label="目次"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
      }}
      className="article-toc sticky z-30 min-w-0 self-start lg:col-start-2 lg:row-start-1"
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={listId}
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:hidden"
      >
        <List className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="shrink-0 font-bold">目次</span>
        <span className="min-w-0 truncate text-subtle">{activeItem?.title ?? `${items.length}件の見出し`}</span>
        <ChevronDown className={cn('ml-auto h-4 w-4 shrink-0', isOpen && 'rotate-180')} aria-hidden="true" />
      </button>
      <h2 className="mb-3 hidden text-sm font-bold text-body lg:block">目次</h2>
      <div
        ref={listRef}
        id={listId}
        className={cn(
          'absolute inset-x-0 top-full mt-2 max-h-[min(60dvh,var(--toc-available-height,60dvh))] overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface p-2 lg:static lg:mt-0 lg:max-h-[calc(100dvh-var(--site-header-height)-4rem)] lg:rounded-none lg:border-0 lg:border-l lg:py-0 lg:pl-2 lg:pr-1',
          isOpen ? 'block' : 'hidden lg:block',
        )}
      >
        <ul className="space-y-1 text-sm">
          {items.map((item) => (
            <li key={item.id} className={item.level === 3 ? 'pl-4' : undefined}>
              <a
                href={`#${encodeURIComponent(item.id)}`}
                aria-current={item.id === activeId ? 'location' : undefined}
                onClick={(event) => {
                  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  setIsOpen(false);
                  focusContent(`#${encodeURIComponent(item.id)}`);
                }}
                className={cn(
                  'block rounded-md px-3 py-2 leading-relaxed [overflow-wrap:anywhere] hover:bg-muted-strong hover:text-ink focus-visible:outline-2 focus-visible:outline-brand lg:py-1.5',
                  item.id === activeId ? 'bg-selected font-semibold text-brand' : 'text-subtle',
                )}
              >
                {item.title}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
