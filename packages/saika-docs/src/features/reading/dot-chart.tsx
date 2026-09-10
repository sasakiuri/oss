// SPDX-License-Identifier: MIT
'use client';
import DOMPurify from 'isomorphic-dompurify';
import { useEffect, useRef, useState } from 'react';

export function DotChart({ source }: { source: string }) {
  const figure = useRef<HTMLElement>(null);
  const [result, setResult] = useState({ svg: '', error: '' });
  useEffect(() => {
    let worker: Worker | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      if (source.length > 20_000) {
        setResult({ svg: '', error: '図が大きすぎます。' });
        return;
      }
      worker = new Worker(new URL('./dot.worker.ts', import.meta.url));
      timeout = setTimeout(() => {
        worker?.terminate();
        setResult({ svg: '', error: '図の表示がタイムアウトしました。' });
      }, 10_000);
      worker.onmessage = (event: MessageEvent<{ svg?: string; error?: string }>) => {
        clearTimeout(timeout);
        worker?.terminate();
        setResult({
          svg: DOMPurify.sanitize(event.data.svg ?? '', {
            USE_PROFILES: { svg: true, svgFilters: true },
            FORBID_TAGS: ['script', 'foreignObject', 'image', 'a'],
          }),
          error: event.data.error ?? '',
        });
      };
      worker.onerror = () => {
        clearTimeout(timeout);
        worker?.terminate();
        setResult({ svg: '', error: '図を表示できませんでした。' });
      };
      worker.postMessage(source);
    });
    if (figure.current) observer.observe(figure.current);
    return () => {
      observer.disconnect();
      clearTimeout(timeout);
      worker?.terminate();
    };
  }, [source]);
  return (
    <figure
      ref={figure}
      className="not-prose border-line my-6 overflow-x-auto rounded-xl border p-4"
      aria-label="文書内の図"
      data-diagram-source={source}
      data-diagram-state={result.svg ? 'ready' : result.error ? 'error' : 'loading'}
    >
      {result.error ? (
        <div role="alert">
          {result.error}
          <pre>{source}</pre>
        </div>
      ) : result.svg ? (
        <div dangerouslySetInnerHTML={{ __html: result.svg }} />
      ) : (
        <p role="status">図を読み込んでいます…</p>
      )}
    </figure>
  );
}
