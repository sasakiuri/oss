'use client';

import { useEffect, useId, useRef, useState } from 'react';

function waitForImageLoad(image: HTMLImageElement, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      image.removeEventListener('load', loaded);
      image.removeEventListener('error', failed);
      signal.removeEventListener('abort', aborted);
    };
    const loaded = () => {
      cleanup();
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(new Error('Image replacement failed to load'));
    };
    const aborted = () => {
      cleanup();
      reject(signal.reason);
    };
    image.addEventListener('load', loaded);
    image.addEventListener('error', failed);
    signal.addEventListener('abort', aborted);
    if (signal.aborted) aborted();
    else if (image.complete) loaded();
  });
}

function waitForImages(images: HTMLImageElement[], signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    Promise.all(
      images.map(async (image) => {
        await image.decode();
        // Decoding the current image can finish while its replacement is still loading.
        if (!image.complete) {
          await waitForImageLoad(image, signal);
          await image.decode();
        }
        if (image.naturalWidth === 0) throw new Error('Image has no decoded content');
      }),
    ).then(
      () => {
        signal.removeEventListener('abort', abort);
        resolve();
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}

/** Wait for article images before printing and restore the reader's expanded sections afterward. */
export function useContentPrint() {
  const statusId = useId();
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'printing' | 'failed'>('idle');
  const requestPrint = useRef<() => void>(() => {});

  useEffect(() => {
    let closedDetails: HTMLDetailsElement[] = [];
    const originalLoading = new Map<HTMLImageElement, string | null>();
    const originalSources = new Map<HTMLImageElement, string>();
    let active: AbortController | null = null;
    let mounted = true;
    const prepare = () => {
      const images = [...document.querySelectorAll<HTMLImageElement>('.reading-article img')];
      images.forEach((image) => {
        if (!originalLoading.has(image)) originalLoading.set(image, image.getAttribute('loading'));
        if (image.dataset.originalSrc && image.hasAttribute('srcset')) {
          if (!originalSources.has(image)) originalSources.set(image, image.getAttribute('srcset')!);
          image.removeAttribute('srcset');
        }
        // A failed image does not fetch again merely because loading becomes eager.
        const src = image.getAttribute('src');
        if (src && image.complete && image.naturalWidth === 0) image.setAttribute('src', src);
        image.setAttribute('loading', 'eager');
      });
      closedDetails.push(...document.querySelectorAll<HTMLDetailsElement>('.reading-article details:not([open])'));
      closedDetails.forEach((details) => {
        details.open = true;
      });
      return images;
    };
    const restore = () => {
      closedDetails.forEach((details) => {
        details.open = false;
      });
      closedDetails = [];
      originalLoading.forEach((loading, image) => {
        if (loading === null) image.removeAttribute('loading');
        else image.setAttribute('loading', loading);
      });
      originalLoading.clear();
      originalSources.forEach((srcset, image) => image.setAttribute('srcset', srcset));
      originalSources.clear();
    };
    const print = async () => {
      if (active) return;
      const controller = new AbortController();
      active = controller;
      setPhase('preparing');
      const images = prepare();
      const timeout = window.setTimeout(() => controller.abort(new Error('Image loading timed out')), 15_000);
      try {
        await waitForImages(images, controller.signal);
        if (!mounted || active !== controller || controller.signal.aborted) return;
        window.clearTimeout(timeout);
        setPhase('printing');
        window.print();
      } catch {
        if (!mounted || active !== controller) return;
        controller.abort();
        restore();
        active = null;
        setPhase('failed');
      } finally {
        window.clearTimeout(timeout);
      }
    };
    requestPrint.current = () => void print();
    const keyboardPrint = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        void print();
      }
    };
    const afterPrint = () => {
      active?.abort();
      active = null;
      restore();
      setPhase('idle');
    };
    // The browser's own print menu cannot await asynchronous work in beforeprint.
    window.addEventListener('beforeprint', prepare);
    window.addEventListener('afterprint', afterPrint);
    window.addEventListener('keydown', keyboardPrint);
    return () => {
      mounted = false;
      active?.abort();
      window.removeEventListener('beforeprint', prepare);
      window.removeEventListener('afterprint', afterPrint);
      window.removeEventListener('keydown', keyboardPrint);
      restore();
    };
  }, []);

  const message = {
    idle: '',
    preparing: '印刷用の画像を読み込んでいます…',
    printing: '印刷ダイアログを開きました。',
    failed: '画像を読み込めませんでした。通信状態を確認して、もう一度お試しください。',
  }[phase];

  return {
    statusId,
    message,
    busy: phase === 'preparing' || phase === 'printing',
    print: () => requestPrint.current(),
  };
}
