'use client';

import { Copy } from 'lucide-react';
import { Fragment, useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

function CopyCode({ source, label }: { source: string; label: string }) {
  const [message, setMessage] = useState('');
  const [copying, setCopying] = useState(false);

  async function copy() {
    setCopying(true);
    setMessage('');
    try {
      await navigator.clipboard.writeText(source);
      setMessage('コピーしました');
    } catch {
      setMessage('コピーできませんでした。コードを選択してコピーしてください。');
    } finally {
      setCopying(false);
    }
  }

  return (
    <span className="code-copy-controls">
      <span role="status">{message}</span>
      <button type="button" onClick={copy} disabled={copying} aria-label={`${label}のコードをコピー`}>
        <Copy className="h-4 w-4" aria-hidden="true" />
        コピー
      </button>
    </span>
  );
}

function Diagram({
  source,
  language,
  sourceDetails,
}: {
  source: string;
  language: string;
  sourceDetails: HTMLDetailsElement;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [result, setResult] = useState({ svg: '', error: '' });

  useEffect(() => {
    const controller = new AbortController();
    void import('@/lib/diagrams')
      .then(({ renderDiagram }) => renderDiagram(source, language, `knowledge-diagram-${id}`, controller.signal))
      .then((svg) => {
        if (controller.signal.aborted) return;
        setResult({ svg, error: '' });
        if (!sourceDetails.contains(document.activeElement)) sourceDetails.open = false;
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        sourceDetails.open = true;
        setResult({ svg: '', error: error instanceof Error ? error.message : '図を表示できませんでした。' });
      });
    return () => controller.abort();
  }, [source, language, id, sourceDetails]);

  return (
    <div data-diagram-state={result.error ? 'error' : result.svg ? 'ready' : 'loading'}>
      {result.error ? (
        <p className="diagram-message" role="alert">
          {result.error} 図のソースを確認してください。
        </p>
      ) : result.svg ? (
        <div
          className="diagram-preview"
          role="region"
          aria-label={`${language} の図（横にスクロールできます）`}
          tabIndex={0}
          dangerouslySetInnerHTML={{ __html: result.svg }}
        />
      ) : (
        <p className="diagram-message" role="status">
          図を読み込んでいます…
        </p>
      )}
    </div>
  );
}

/** Keep server-rendered HTML intact; mount only controls and diagrams into reserved slots. */
export function MarkdownContent({ html, className }: { html: string; className: string }) {
  // Rebind portals when content changes, including development-time Markdown updates.
  return <EnhancedMarkdown key={html} html={html} className={className} />;
}

function EnhancedMarkdown({ html, className }: { html: string; className: string }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const blocks = useMemo(() => {
    if (!container) return [];
    return Array.from(container.querySelectorAll<HTMLElement>('[data-code-block]')).flatMap((block) => {
      const controls = block.querySelector<HTMLElement>('[data-code-controls]');
      const code = block.querySelector('pre > code');
      if (!controls || !code) return [];
      return [
        {
          controls,
          source: code.textContent ?? '',
          label: block.querySelector('figcaption > span')?.textContent || 'コードブロック',
          language: block.dataset.codeLanguage ?? '',
          target: block.querySelector<HTMLElement>('[data-diagram-target]'),
          sourceDetails: block.querySelector<HTMLDetailsElement>('[data-diagram-source]'),
        },
      ];
    });
  }, [container]);

  return (
    <>
      <div ref={setContainer} className={className} dangerouslySetInnerHTML={{ __html: html }} />
      {blocks.map((block, index) => (
        <Fragment key={index}>
          {createPortal(<CopyCode source={block.source} label={block.label} />, block.controls)}
          {block.target &&
            block.sourceDetails &&
            createPortal(
              <Diagram source={block.source} language={block.language} sourceDetails={block.sourceDetails} />,
              block.target,
            )}
        </Fragment>
      ))}
    </>
  );
}
