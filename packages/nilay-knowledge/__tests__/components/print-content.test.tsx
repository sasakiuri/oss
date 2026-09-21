/* eslint-disable @next/next/no-img-element -- Exercise native Markdown images and their loading attributes. */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { SnsShare } from '@/components/sns-share';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

function articleImages() {
  const view = render(
    <>
      <article className="reading-article">
        <details aria-label="閉じた資料">
          <summary>資料</summary>
          <img src="/lazy.png" alt="遅延画像" loading="lazy" />
        </details>
        <img src="/default.png" alt="通常画像" />
      </article>
      <SnsShare printable />
    </>,
  );
  fireEvent.click(screen.getByRole('button', { name: '共有・印刷' }));
  return view;
}

function decodedImage(alt: string, promise = Promise.resolve(), width = 100) {
  const image = screen.getByAltText(alt);
  const decode = vi.fn().mockReturnValue(promise);
  Object.defineProperties(image, {
    decode: { value: decode, configurable: true },
    naturalWidth: { value: width, configurable: true },
  });
  return { image, decode };
}

it('prints collapsed content and restores only the details it opened, including after unmount', () => {
  const { unmount } = render(
    <>
      <article className="reading-article">
        <details aria-label="閉じた資料">
          <summary>資料</summary>本文
        </details>
        <details aria-label="開いた資料" open>
          <summary>別の資料</summary>本文
        </details>
      </article>
      <details aria-label="記事以外">
        <summary>その他</summary>本文
      </details>
      <SnsShare printable />
    </>,
  );
  const closed = screen.getByLabelText('閉じた資料');
  const opened = screen.getByLabelText('開いた資料');
  fireEvent(window, new Event('beforeprint'));
  fireEvent(window, new Event('beforeprint'));
  expect(closed).toHaveAttribute('open');
  expect(opened).toHaveAttribute('open');
  expect(screen.getByLabelText('記事以外')).not.toHaveAttribute('open');
  fireEvent(window, new Event('afterprint'));
  expect(closed).not.toHaveAttribute('open');
  expect(opened).toHaveAttribute('open');
  fireEvent(window, new Event('beforeprint'));
  unmount();
  expect(closed).not.toHaveAttribute('open');
});

it('loads offscreen article images for printing and restores their loading policy', () => {
  const { unmount } = render(
    <>
      <article className="reading-article">
        <img src="/lazy.png" alt="遅延画像" loading="lazy" />
        <img src="/eager.png" alt="優先画像" loading="eager" />
      </article>
      <img src="/outside.png" alt="記事以外" loading="lazy" />
      <SnsShare printable />
    </>,
  );
  const lazy = screen.getByAltText('遅延画像');
  lazy.setAttribute('srcset', '/optimized.webp 128w');
  lazy.setAttribute('data-original-src', '/lazy.png');
  const eager = screen.getByAltText('優先画像');
  eager.setAttribute('srcset', '/authored.webp 2x');
  fireEvent(window, new Event('beforeprint'));
  fireEvent(window, new Event('beforeprint'));
  expect(lazy).toHaveAttribute('loading', 'eager');
  expect(lazy).not.toHaveAttribute('srcset');
  expect(eager).toHaveAttribute('srcset', '/authored.webp 2x');
  expect(screen.getByAltText('記事以外')).toHaveAttribute('loading', 'lazy');
  fireEvent(window, new Event('afterprint'));
  expect(lazy).toHaveAttribute('loading', 'lazy');
  expect(lazy).toHaveAttribute('srcset', '/optimized.webp 128w');
  expect(screen.getByAltText('優先画像')).toHaveAttribute('loading', 'eager');
  fireEvent(window, new Event('beforeprint'));
  unmount();
  expect(lazy).toHaveAttribute('loading', 'lazy');
});

it('waits for every image to decode before printing and restores reading state after printing', async () => {
  articleImages();
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  const first = deferred();
  const second = deferred();
  const lazy = decodedImage('遅延画像', first.promise);
  const normal = decodedImage('通常画像', second.promise);
  const button = screen.getByRole('button', { name: 'ページを印刷' });

  fireEvent.click(button);
  expect(button).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('印刷用の画像を読み込んでいます');
  expect(screen.getByLabelText('閉じた資料')).toHaveAttribute('open');
  expect(lazy.image).toHaveAttribute('loading', 'eager');
  expect(normal.image).toHaveAttribute('loading', 'eager');
  expect(print).not.toHaveBeenCalled();

  await act(async () => first.resolve());
  expect(print).not.toHaveBeenCalled();
  await act(async () => second.resolve());
  expect(print).toHaveBeenCalledTimes(1);
  expect(button).toBeDisabled();

  fireEvent(window, new Event('beforeprint'));
  fireEvent(window, new Event('afterprint'));
  expect(screen.getByLabelText('閉じた資料')).not.toHaveAttribute('open');
  expect(lazy.image).toHaveAttribute('loading', 'lazy');
  expect(normal.image).not.toHaveAttribute('loading');
  expect(button).toBeEnabled();
});

it.each(['ctrlKey', 'metaKey'] as const)(
  'prepares images before the %s+P shortcut and ignores duplicate requests',
  async (modifier) => {
    articleImages();
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const pending = deferred();
    const lazy = decodedImage('遅延画像', pending.promise);
    decodedImage('通常画像');
    fireEvent.click(screen.getByRole('button', { name: '共有・印刷' }));
    expect(screen.queryByRole('button', { name: 'ページを印刷' })).not.toBeInTheDocument();
    const shortcut = new KeyboardEvent('keydown', { key: 'p', [modifier]: true, cancelable: true });

    fireEvent(window, shortcut);
    expect(shortcut.defaultPrevented).toBe(true);
    fireEvent.keyDown(window, { key: 'p', [modifier]: true });
    fireEvent.click(screen.getByRole('button', { name: '共有・印刷' }));
    fireEvent.click(screen.getByRole('button', { name: 'ページを印刷' }));
    expect(lazy.decode).toHaveBeenCalledTimes(1);
    expect(print).not.toHaveBeenCalled();

    await act(async () => pending.resolve());
    expect(print).toHaveBeenCalledTimes(1);
    fireEvent(window, new Event('afterprint'));
  },
);

it('leaves other keyboard shortcuts unchanged', () => {
  articleImages();
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  const lazy = decodedImage('遅延画像');
  for (const options of [{ key: 'p' }, { key: 'p', ctrlKey: true, shiftKey: true }, { key: 's', metaKey: true }]) {
    const event = new KeyboardEvent('keydown', { ...options, cancelable: true });
    fireEvent(window, event);
    expect(event.defaultPrevented).toBe(false);
  }
  expect(lazy.decode).not.toHaveBeenCalled();
  expect(print).not.toHaveBeenCalled();
});

it.each(['decode failure', 'empty image'] as const)(
  'reports %s without printing and permits retry',
  async (failure) => {
    articleImages();
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const pending = deferred();
    const lazy = decodedImage('遅延画像', pending.promise, failure === 'empty image' ? 0 : 100);
    decodedImage('通常画像');
    const button = screen.getByRole('button', { name: 'ページを印刷' });
    fireEvent.click(button);
    await act(async () => {
      if (failure === 'decode failure') pending.reject(new Error('Network error'));
      else pending.resolve();
    });
    expect(screen.getByRole('status')).toHaveTextContent('画像を読み込めませんでした');
    expect(print).not.toHaveBeenCalled();
    expect(button).toBeEnabled();
    expect(screen.getByLabelText('閉じた資料')).not.toHaveAttribute('open');
    expect(lazy.image).toHaveAttribute('loading', 'lazy');
    expect(screen.getByAltText('通常画像')).not.toHaveAttribute('loading');

    decodedImage('遅延画像');
    fireEvent.click(button);
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    fireEvent(window, new Event('afterprint'));
  },
);

it('times out after 15 seconds, restores reading state and does not print when decoding eventually finishes', async () => {
  vi.useFakeTimers();
  articleImages();
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  const pending = deferred();
  const lazy = decodedImage('遅延画像', pending.promise);
  decodedImage('通常画像');
  const button = screen.getByRole('button', { name: 'ページを印刷' });
  fireEvent.click(button);

  await act(async () => vi.advanceTimersByTimeAsync(15_000));
  expect(screen.getByRole('status')).toHaveTextContent('画像を読み込めませんでした');
  expect(button).toBeEnabled();
  expect(screen.getByLabelText('閉じた資料')).not.toHaveAttribute('open');
  expect(lazy.image).toHaveAttribute('loading', 'lazy');
  await act(async () => pending.resolve());
  expect(print).not.toHaveBeenCalled();
});

it('aborts pending preparation on unmount and never prints after its images finish', async () => {
  const { unmount } = articleImages();
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  const pending = deferred();
  const lazy = decodedImage('遅延画像', pending.promise);
  const normal = decodedImage('通常画像');
  const details = screen.getByLabelText('閉じた資料');
  fireEvent.click(screen.getByRole('button', { name: 'ページを印刷' }));
  unmount();
  expect(details).not.toHaveAttribute('open');
  expect(lazy.image).toHaveAttribute('loading', 'lazy');
  expect(normal.image).not.toHaveAttribute('loading');

  await act(async () => pending.resolve());
  expect(print).not.toHaveBeenCalled();
});

it('continues preparing images when the action menu closes', async () => {
  articleImages();
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  const pending = deferred();
  const lazy = decodedImage('遅延画像', pending.promise);
  decodedImage('通常画像');
  fireEvent.click(screen.getByRole('button', { name: 'ページを印刷' }));
  fireEvent.click(screen.getByRole('button', { name: '共有・印刷' }));
  expect(screen.queryByRole('button', { name: 'ページを印刷' })).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('印刷用の画像を読み込んでいます');
  await act(async () => pending.resolve());
  expect(print).toHaveBeenCalledTimes(1);
  fireEvent(window, new Event('afterprint'));
  expect(lazy.image).toHaveAttribute('loading', 'lazy');
});
