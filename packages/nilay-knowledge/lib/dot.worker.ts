// cspell:ignore fontname bgcolor
import { instance } from '@viz-js/viz';
import { expose } from 'comlink';

async function renderDot(source: string): Promise<string> {
  const viz = await instance();
  const fontname = 'Noto Sans JP, sans-serif';
  return viz.renderString(source, {
    format: 'svg',
    graphAttributes: { fontname, bgcolor: 'white' },
    nodeAttributes: { fontname },
    edgeAttributes: { fontname },
  });
}

export type DotWorkerApi = typeof renderDot;

expose(renderDot);
