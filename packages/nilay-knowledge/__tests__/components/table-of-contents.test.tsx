import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TableOfContents } from '@/components/table-of-contents';
import type { TocItem } from '@/lib/content/types';

const items: TocItem[] = [
  { id: 'first', title: '最初の章', level: 2 },
  { id: '日本語%の節', title: '長い章の途中', level: 3 },
  { id: 'last', title: '最後の章', level: 2 },
];

let positions: Record<string, number>;
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;

function flushFrames() {
  act(() => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(0));
  });
}

function renderArticle() {
  return render(
    <>
      <article>
        {items.map((item) => (
          <h2 key={item.id} id={item.id} style={{ scrollMarginTop: 80 }}>
            {item.title}
          </h2>
        ))}
      </article>
      <TableOfContents items={items} />
    </>,
  );
}

describe('TableOfContents', () => {
  beforeEach(() => {
    positions = { first: 300, '日本語%の節': 900, last: 2400 };
    frames = new Map();
    nextFrame = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return new DOMRect(0, positions[this.id] ?? 0, 200, 30);
    });
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([new DOMRect()] as unknown as DOMRectList);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders nothing when there are no headings', () => {
    render(<TableOfContents items={[]} />);
    expect(screen.queryByRole('navigation', { name: '目次' })).not.toBeInTheDocument();
    expect(frames.size).toBe(0);
  });

  it('opens the mobile list and preserves Japanese and literal percent signs in anchor targets', () => {
    renderArticle();
    const button = screen.getByRole('button', { name: /目次/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: '長い章の途中' })).toHaveAttribute(
      'href',
      `#${encodeURIComponent('日本語%の節')}`,
    );
  });

  it('keeps the current section active between distant headings, including when scrolling back up', () => {
    renderArticle();
    flushFrames();
    expect(screen.getByRole('link', { name: '最初の章' })).not.toHaveAttribute('aria-current');

    positions = { first: -900, '日本語%の節': -300, last: 1200 };
    fireEvent.scroll(window);
    flushFrames();
    expect(screen.getByRole('link', { name: '長い章の途中' })).toHaveAttribute('aria-current', 'location');
    expect(screen.getByRole('button', { name: /目次/ })).toHaveTextContent('長い章の途中');

    positions = { first: -200, '日本語%の節': 81, last: 1800 };
    fireEvent.scroll(window);
    flushFrames();
    expect(screen.getByRole('link', { name: '長い章の途中' })).toHaveAttribute('aria-current', 'location');

    positions['日本語%の節'] = 82;
    fireEvent.scroll(window);
    flushFrames();
    expect(screen.getByRole('link', { name: '最初の章' })).toHaveAttribute('aria-current', 'location');
    expect(screen.getByRole('link', { name: '長い章の途中' })).not.toHaveAttribute('aria-current');
  });

  it('detects the initial scroll position and updates after hash navigation or resizing', () => {
    positions = { first: -300, '日本語%の節': 80, last: 1600 };
    renderArticle();
    flushFrames();
    expect(screen.getByRole('link', { name: '長い章の途中' })).toHaveAttribute('aria-current', 'location');

    positions.last = 80;
    fireEvent(window, new HashChangeEvent('hashchange'));
    flushFrames();
    expect(screen.getByRole('link', { name: '最後の章' })).toHaveAttribute('aria-current', 'location');

    positions.last = 200;
    fireEvent.resize(window);
    flushFrames();
    expect(screen.getByRole('link', { name: '長い章の途中' })).toHaveAttribute('aria-current', 'location');
  });

  it('closes on selection and moves keyboard focus to the target heading', () => {
    renderArticle();
    const button = screen.getByRole('button', { name: /目次/ });
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('link', { name: '長い章の途中' }));
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('heading', { name: '長い章の途中' })).toHaveFocus();
  });

  it('marks the last section at the page bottom even when its heading cannot reach the header', () => {
    vi.stubGlobal('scrollY', 1000);
    vi.stubGlobal('innerHeight', 800);
    vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(1800);
    positions = { first: -900, '日本語%の節': -300, last: 500 };
    renderArticle();
    flushFrames();
    expect(screen.getByRole('link', { name: '最後の章' })).toHaveAttribute('aria-current', 'location');
  });

  it('leaves modified link clicks to the browser', () => {
    renderArticle();
    const button = screen.getByRole('button', { name: /目次/ });
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('link', { name: '最初の章' }), { ctrlKey: true });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('heading', { name: '最初の章' })).not.toHaveFocus();
  });

  it('closes with Escape or an outside pointer press and restores focus on Escape', () => {
    renderArticle();
    const button = screen.getByRole('button', { name: /目次/ });
    fireEvent.click(button);
    screen.getByRole('link', { name: '最初の章' }).focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();

    fireEvent.click(button);
    fireEvent.pointerDown(screen.getByRole('heading', { name: '最初の章' }));
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes when keyboard focus leaves the navigation', () => {
    renderArticle();
    const button = screen.getByRole('button', { name: /目次/ });
    fireEvent.click(button);
    const link = screen.getByRole('link', { name: '最初の章' });
    link.focus();
    fireEvent.blur(link, { relatedTarget: screen.getByRole('heading', { name: '最初の章' }) });
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not steal Escape from another control', () => {
    renderArticle();
    const button = screen.getByRole('button', { name: /目次/ });
    fireEvent.click(button);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(button).not.toHaveFocus();
  });

  it('coalesces scroll events and cancels pending work on unmount', () => {
    const { unmount } = renderArticle();
    fireEvent.scroll(window);
    fireEvent.scroll(window);
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
    fireEvent.scroll(window);
    expect(frames.size).toBe(0);
  });
});
