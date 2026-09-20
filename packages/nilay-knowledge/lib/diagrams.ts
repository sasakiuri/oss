import DOMPurify from 'isomorphic-dompurify';

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

function renderDot(source: string, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./dot.worker.ts', import.meta.url));
    const finish = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      worker.terminate();
    };
    const abort = () => {
      finish();
      reject(new Error('図の描画を中止しました。'));
    };
    const timeout = setTimeout(() => {
      finish();
      reject(new Error('図の表示がタイムアウトしました。'));
    }, 10_000);
    worker.onmessage = (event: MessageEvent<{ svg?: string; error?: string }>) => {
      finish();
      if (event.data.svg) resolve(event.data.svg);
      else reject(new Error('図を表示できませんでした。'));
    };
    worker.onerror = () => {
      finish();
      reject(new Error('図を表示できませんでした。'));
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    else worker.postMessage(source);
  });
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
