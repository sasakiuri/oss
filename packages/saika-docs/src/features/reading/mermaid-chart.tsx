// SPDX-License-Identifier: MIT
'use client';

import { useTheme } from 'next-themes';
import { useEffect, useId, useRef, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

function Diagram({ source }: { source: string }) {
  const { resolvedTheme } = useTheme();
  const id = useId().replaceAll(':', '').replaceAll('«', '').replaceAll('»', '');
  const figure = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = figure.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const [result, setResult] = useState({ svg: '', error: '' });
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void import('mermaid')
      .then(async ({ default: mermaid }) => {
        const styles = getComputedStyle(figure.current ?? document.documentElement);
        const color = (name: string) => styles.getPropertyValue(name).trim();
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          htmlLabels: false,
          flowchart: { useMaxWidth: false },
          theme: 'base',
          themeVariables: {
            darkMode: resolvedTheme === 'dark',
            background: color('--surface'),
            primaryColor: color('--muted'),
            primaryTextColor: color('--ink'),
            primaryBorderColor: color('--subtle'),
            secondaryColor: color('--surface'),
            secondaryTextColor: color('--ink'),
            tertiaryColor: color('--muted'),
            tertiaryTextColor: color('--ink'),
            lineColor: color('--subtle'),
            textColor: color('--ink'),
            fontFamily: styles.fontFamily,
            fontSize: '14px',
          },
        });
        const { svg } = await mermaid.render(`diagram-${id}`, source);
        if (!cancelled) setResult({ svg, error: '' });
      })
      .catch(() => {
        if (!cancelled) setResult({ svg: '', error: '図を表示できませんでした。' });
      });
    return () => {
      cancelled = true;
    };
  }, [source, resolvedTheme, id, visible]);
  if (result.error)
    return (
      <div role="alert">
        <p>{result.error}</p>
        <pre>
          <code>{source}</code>
        </pre>
      </div>
    );
  return (
    <figure
      ref={figure}
      className="not-prose border-line bg-surface my-6 overflow-x-auto rounded-xl border p-4"
      aria-label="文書内の図"
      tabIndex={0}
      data-diagram-source={source}
      data-diagram-state={result.svg ? 'ready' : 'loading'}
    >
      {result.svg ? (
        <div className="mermaid flex min-w-fit justify-center" dangerouslySetInnerHTML={{ __html: result.svg }} />
      ) : (
        <p className="text-subtle text-sm" role="status">
          図を読み込んでいます…
        </p>
      )}
    </figure>
  );
}

export function MermaidChart({ source }: { source: string }) {
  return (
    <ErrorBoundary
      fallback={
        <pre>
          <code>{source}</code>
        </pre>
      }
    >
      <Diagram source={source} />
    </ErrorBoundary>
  );
}
