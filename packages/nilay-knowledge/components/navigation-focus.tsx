'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { focusContent } from '@/lib/focus-content';

/** Persistent navigation must hand focus to the newly rendered page. */
export function NavigationFocus() {
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const historyNavigation = useRef(false);

  useEffect(() => {
    const onPopState = () => {
      historyNavigation.current = true;
    };
    const onClick = () => {
      historyNavigation.current = false;
    };
    window.addEventListener('popstate', onPopState);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    // Let browser history retain its scroll position instead of focusing an offscreen title.
    if (historyNavigation.current) {
      historyNavigation.current = false;
      return;
    }
    const frame = requestAnimationFrame(() => focusContent(window.location.hash));
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}
