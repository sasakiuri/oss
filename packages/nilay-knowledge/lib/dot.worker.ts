// cspell:ignore fontname
import { instance } from '@viz-js/viz';

self.onmessage = async (event: MessageEvent<string>) => {
  try {
    const viz = await instance();
    const fontname = 'Noto Sans JP, sans-serif';
    self.postMessage({
      svg: viz.renderString(event.data, {
        format: 'svg',
        graphAttributes: { fontname, bgcolor: 'white' },
        nodeAttributes: { fontname },
        edgeAttributes: { fontname },
      }),
    });
  } catch {
    self.postMessage({ error: '図を表示できませんでした。' });
  }
};
