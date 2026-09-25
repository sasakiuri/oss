'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Offline use of Labs: registers the service worker in `public/labs-sw.js` for /labs and every tool
 * under it, so a page opened once keeps working without a connection.
 *
 * The version is fixed when the site is built (see `next.config.ts`) and goes in the worker's URL, so
 * each build installs a worker of its own and replaces the previous one; how pages and files are cached
 * is described in the worker. Only production builds register it: a development server's files change
 * on every edit and would be served stale.
 */
export const labsServiceWorkerPath = '/labs-sw.js';
export const labsServiceWorkerScope = '/labs';

export function labsServiceWorkerUrl(version: string): string {
  return `${labsServiceWorkerPath}?v=${encodeURIComponent(version)}`;
}

function serviceWorkerEnabled(): boolean {
  return (
    process.env.NODE_ENV === 'production' &&
    Boolean(process.env.NEXT_PUBLIC_LABS_OFFLINE_VERSION) &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator
  );
}

export function LabsOfflineSupport() {
  const pathname = usePathname();
  useEffect(() => {
    const version = process.env.NEXT_PUBLIC_LABS_OFFLINE_VERSION;
    if (!serviceWorkerEnabled() || !version) return;
    // A refusal (a private window, a browser setting) leaves the pages working online as before.
    navigator.serviceWorker
      .register(labsServiceWorkerUrl(version), { scope: labsServiceWorkerScope })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!serviceWorkerEnabled() || !pathname.startsWith(labsServiceWorkerScope)) return;
    let cancelled = false;
    // Each page asks to be kept once the worker is in charge: a page opened before then, on the first
    // visit or while a new worker was still activating, was not kept on its way in.
    void navigator.serviceWorker.ready.then((registration) => {
      if (!cancelled) registration.active?.postMessage({ type: 'keep-page', path: pathname });
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);
  return null;
}

/**
 * Asks the service worker to keep files this page will need offline but may not load while online,
 * such as every photo of a test that shows only a few at a time. Same-origin files only; the worker
 * ignores anything it would not cache anyway.
 */
export function useOfflineAssets(urls: readonly string[]) {
  useEffect(() => {
    if (!serviceWorkerEnabled() || urls.length === 0) return;
    let cancelled = false;
    void navigator.serviceWorker.ready.then((registration) => {
      if (!cancelled) registration.active?.postMessage({ type: 'cache-urls', urls: [...urls] });
    });
    return () => {
      cancelled = true;
    };
  }, [urls]);
}
