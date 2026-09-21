import DOMPurify from 'isomorphic-dompurify';

import type { DotWorkerApi } from './dot.worker';
import { createWorkerClient } from './worker-client';

let mermaidModule: Promise<(typeof import('mermaid'))['default']> | undefined;

async function renderMermaid(source: string, id: string): Promise<string> {
  mermaidModule ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      htmlLabels: false,
      theme: 'default',
      maxTextSize: 20_000,
      maxEdges: 500,
      flowchart: { useMaxWidth: false },
    });
    return mermaid;
  });
  const mermaid = await mermaidModule;
  return (await mermaid.render(id, source)).svg;
}

async function renderDot(source: string, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  const client = createWorkerClient<DotWorkerApi>(
    new Worker(new URL('./dot.worker.ts', import.meta.url)),
    '図を表示できませんでした。',
  );
  const abort = () => client.dispose(new Error('図の描画を中止しました。'));
  const timeout = setTimeout(() => client.dispose(new Error('図の表示がタイムアウトしました。')), 10_000);
  signal.addEventListener('abort', abort, { once: true });
  try {
    return await client.call((render) => render(source));
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
    client.dispose();
  }
}

export async function renderDiagram(
  source: string,
  language: string,
  id: string,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();
  if (source.length > 20_000) throw new Error('図のソースは20,000文字以内にしてください。');
  let svg: string;
  try {
    svg = language === 'mermaid' ? await renderMermaid(source, id) : await renderDot(source, signal);
  } catch {
    throw new Error('図を表示できませんでした。');
  }
  signal.throwIfAborted();
  const sanitized = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'foreignObject', 'image', 'a'],
  });
  if (!sanitized.trim()) throw new Error('図を表示できませんでした。');
  return sanitized;
}
