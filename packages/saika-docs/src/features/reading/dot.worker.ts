// SPDX-License-Identifier: MIT
// cspell:ignore fontname
import { instance } from '@viz-js/viz';

self.onmessage = async (event: MessageEvent<string>) => {
  try {
    const viz = await instance();
    const fontname = 'Inter Variable, Noto Sans JP Variable, sans-serif';
    self.postMessage({
      svg: viz.renderString(event.data, {
        format: 'svg',
        graphAttributes: { fontname },
        nodeAttributes: { fontname },
        edgeAttributes: { fontname },
      }),
    });
  } catch {
    self.postMessage({ error: '図を表示できませんでした。' });
  }
};
