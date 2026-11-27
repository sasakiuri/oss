// SPDX-License-Identifier: MIT
import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DotChart } from '@/features/reading/dot-chart';
import { useFirstVisible } from '@/features/reading/use-first-visible';

class FakeIntersectionObserver {
  static readonly instances: FakeIntersectionObserver[] = [];
  readonly targets = new Set<Element>();
  disconnected = false;
  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.instances.push(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.disconnected = true;
    this.targets.clear();
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  report(target: Element, isIntersecting: boolean) {
    this.callback([{ target, isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

/** Reports the element to every observer that watches it, as the browser does while scrolling. */
function scroll(element: Element, isIntersecting: boolean) {
  for (const observer of FakeIntersectionObserver.instances.filter((item) => item.targets.has(element)))
    act(() => observer.report(element, isIntersecting));
}

class FakeWorker {
  static readonly instances: FakeWorker[] = [];
  readonly messages: unknown[] = [];
  terminated = false;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  constructor(readonly url: URL | string) {
    FakeWorker.instances.push(this);
  }
  postMessage(message: unknown) {
    this.messages.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  reply(data: { svg?: string; error?: string }) {
    act(() => this.onmessage?.(new MessageEvent('message', { data })));
  }
  fail() {
    act(() => this.onerror?.(new ErrorEvent('error')));
  }
}

beforeEach(() => {
  FakeIntersectionObserver.instances.length = 0;
  FakeWorker.instances.length = 0;
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('first visibility', () => {
  function Probe({ attached = true }: { attached?: boolean }) {
    const element = useRef<HTMLDivElement>(null);
    const visible = useFirstVisible(element);
    return attached ? <div ref={element}>{visible ? 'visible' : 'hidden'}</div> : <p>{String(visible)}</p>;
  }

  it('turns true on the first intersection and stops observing', () => {
    render(<Probe />);
    const element = screen.getByText('hidden');
    const [observer] = FakeIntersectionObserver.instances;
    expect(observer?.targets).toEqual(new Set([element]));
    scroll(element, false);
    expect(element).toHaveTextContent('hidden');
    expect(observer?.disconnected).toBe(false);
    scroll(element, true);
    expect(element).toHaveTextContent('visible');
    expect(observer?.disconnected).toBe(true);
  });

  it('disconnects when unmounted before becoming visible and ignores a missing element', () => {
    const { unmount } = render(<Probe />);
    unmount();
    expect(FakeIntersectionObserver.instances[0]?.disconnected).toBe(true);
    render(<Probe attached={false} />);
    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    expect(screen.getByText('false')).toBeInTheDocument();
  });
});

describe('Graphviz chart', () => {
  const source = 'digraph reference { Markdown -> NextJS; }';
  const figure = () => screen.getByRole('figure', { name: '文書内の図' });

  it('starts the worker only once visible and shows the sanitized SVG', () => {
    render(<DotChart source={source} />);
    expect(screen.getByRole('status')).toHaveTextContent('図を読み込んでいます…');
    expect(FakeWorker.instances).toHaveLength(0);
    scroll(figure(), true);
    const [worker] = FakeWorker.instances;
    expect(String(worker?.url)).toContain('dot.worker');
    expect(worker?.messages).toEqual([source]);
    worker?.reply({
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><g><text>Markdown</text><a href="https://example.com"><text>link</text></a></g><script>alert(1)</script></svg>',
    });
    expect(figure()).toHaveAttribute('data-diagram-state', 'ready');
    expect(figure().querySelector('svg text')).toHaveTextContent('Markdown');
    expect(figure().querySelector('script, a')).toBeNull();
    expect(worker?.terminated).toBe(true);
  });

  it('shows the source with the error the worker reports', () => {
    render(<DotChart source={source} />);
    scroll(figure(), true);
    FakeWorker.instances[0]?.reply({ error: '図を表示できませんでした。' });
    expect(figure()).toHaveAttribute('data-diagram-state', 'error');
    expect(screen.getByRole('alert')).toHaveTextContent('図を表示できませんでした。');
    expect(screen.getByRole('alert').querySelector('pre')).toHaveTextContent(source);
  });

  it('reports a failed worker and stops it', () => {
    render(<DotChart source={source} />);
    scroll(figure(), true);
    const [worker] = FakeWorker.instances;
    worker?.fail();
    expect(screen.getByRole('alert')).toHaveTextContent('図を表示できませんでした。');
    expect(worker?.terminated).toBe(true);
  });

  it('stops a worker that does not answer within ten seconds', () => {
    vi.useFakeTimers();
    render(<DotChart source={source} />);
    scroll(figure(), true);
    act(() => vi.advanceTimersByTime(9_999));
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('alert')).toHaveTextContent('図の表示がタイムアウトしました。');
    expect(FakeWorker.instances[0]?.terminated).toBe(true);
  });

  it('stops the worker when the chart leaves the page', () => {
    vi.useFakeTimers();
    const { unmount } = render(<DotChart source={source} />);
    scroll(figure(), true);
    unmount();
    expect(FakeWorker.instances[0]?.terminated).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('refuses oversized sources without starting a worker', () => {
    const large = `digraph large { ${'a -> b; '.repeat(2_500)}}`;
    render(<DotChart source={large} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    scroll(figure(), true);
    expect(screen.getByRole('alert')).toHaveTextContent('図が大きすぎます。');
    expect(FakeWorker.instances).toHaveLength(0);
  });
});
