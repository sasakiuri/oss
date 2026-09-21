// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderDiagram } from '@/lib/diagrams';

import { TestWorker } from '../support/worker';

let worker: TestWorker;
let render: ReturnType<typeof vi.fn>;
let controller: AbortController;

beforeEach(() => {
  controller = new AbortController();
  render = vi.fn(async () => '<svg xmlns="http://www.w3.org/2000/svg"><text>鳥類</text></svg>');
  worker = new TestWorker(render);
  vi.stubGlobal(
    'Worker',
    vi.fn(function () {
      return worker;
    }),
  );
});

afterEach(() => {
  worker.terminate();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('DOT rendering through Comlink', () => {
  it('passes the source, sanitizes returned SVG and terminates the worker', async () => {
    render.mockResolvedValueOnce(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><text>鳥類</text></svg>',
    );
    const svg = await renderDiagram('digraph { a -> b }', 'dot', 'diagram', controller.signal);
    expect(render).toHaveBeenCalledExactlyOnceWith('digraph { a -> b }');
    expect(svg).toContain('<text>鳥類</text>');
    expect(svg).not.toContain('<script');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('reports remote failures and terminates the worker', async () => {
    render.mockRejectedValueOnce(new Error('Invalid DOT syntax'));
    await expect(renderDiagram('invalid', 'graphviz', 'diagram', controller.signal)).rejects.toThrow(
      '図を表示できませんでした。',
    );
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('cancels an in-flight render without waiting for a worker response', async () => {
    const pending = Promise.withResolvers<string>();
    render.mockReturnValue(pending.promise);
    const result = renderDiagram('digraph {}', 'dot', 'diagram', controller.signal);
    const rejected = result.catch((error: unknown) => error);
    await vi.waitFor(() => expect(render).toHaveBeenCalledOnce());
    controller.abort();
    expect(await rejected).toEqual(new Error('図を表示できませんでした。'));
    expect(worker.terminate).toHaveBeenCalledOnce();
    pending.resolve('<svg/>');
  });

  it('times out an unresponsive worker and terminates it', async () => {
    vi.useFakeTimers();
    const pending = Promise.withResolvers<string>();
    render.mockReturnValue(pending.promise);
    const result = renderDiagram('digraph {}', 'dot', 'diagram', controller.signal);
    const rejected = result.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await rejected).toEqual(new Error('図を表示できませんでした。'));
    expect(worker.terminate).toHaveBeenCalledOnce();
    pending.resolve('<svg/>');
  });

  it('does not start a worker when already cancelled', async () => {
    controller.abort();
    await expect(renderDiagram('digraph {}', 'dot', 'diagram', controller.signal)).rejects.toThrow();
    expect(Worker).not.toHaveBeenCalled();
  });
});
