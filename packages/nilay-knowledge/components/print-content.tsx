'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';

function waitForImages(images: HTMLImageElement[], signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    Promise.all(
      images.map(async (image) => {
        await image.decode();
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
export function PrintContent() {
  const statusId = useId();
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'printing' | 'failed'>('idle');
  const requestPrint = useRef<() => void>(() => {});

  useEffect(() => {
    let closedDetails: HTMLDetailsElement[] = [];
    const originalLoading = new Map<HTMLImageElement, string | null>();
    let active: AbortController | null = null;
    let mounted = true;
    const prepare = () => {
      const images = [...document.querySelectorAll<HTMLImageElement>('.reading-article img')];
      images.forEach((image) => {
        if (!originalLoading.has(image)) originalLoading.set(image, image.getAttribute('loading'));
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

  return (
    <div className="mx-auto mb-8 max-w-5xl px-4 print:hidden">
      <Button
        type="button"
        variant="outline"
        onClick={() => requestPrint.current()}
        disabled={phase === 'preparing' || phase === 'printing'}
        aria-describedby={statusId}
      >
        ページを印刷
      </Button>
      <p id={statusId} role="status" aria-atomic="true" className="mt-2 text-sm text-subtle">
        {message}
      </p>
    </div>
  );
}
