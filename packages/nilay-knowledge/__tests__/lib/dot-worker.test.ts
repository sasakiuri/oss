// @vitest-environment node
import { expose } from 'comlink';
import { expect, it, vi } from 'vitest';

import type { DotWorkerApi } from '@/lib/dot.worker';

vi.mock('comlink', () => ({ expose: vi.fn() }));

it('exposes a real Graphviz renderer that returns SVG and rejects invalid DOT', async () => {
  await import('@/lib/dot.worker');
  const render = vi.mocked(expose).mock.calls[0]![0] as DotWorkerApi;
  const svg = await render('digraph { a [label="鳥類"]; a -> b }');
  expect(svg).toContain('<svg');
  expect(svg).toContain('鳥類');
  await expect(render('this is not a graph')).rejects.toThrow();
});
