'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface AppLayoutProps {
  children: ReactNode;
  header: ReactNode;
  /** Jump links, for the tools long enough that scrolling past a section is the only way to a later one. */
  nav?: ReactNode;
}

/** Full-screen layout for a Labs tool: the pinned bar and the content. */
export function AppLayout({ children, header, nav }: AppLayoutProps) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // A column that stays in view has to clear the bar, whose height depends on the jump links
    // wrapping and on the text size, so it is measured rather than assumed.
    const element = bar.current;
    if (!element) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => root.style.setProperty('--labs-bar-height', `${element.offsetHeight}px`));
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--labs-bar-height');
    };
  }, []);
  return (
    <div className="flex min-h-dvh flex-col bg-surface-container-low">
      {/* One sticky block, so the jump links never slide under the bar. */}
      <div ref={bar} className="sticky top-0 z-30 print:static">
        {header}
        {nav}
      </div>
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</div>
    </div>
  );
}
