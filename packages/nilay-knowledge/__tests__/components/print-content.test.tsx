import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { PrintContent } from '@/components/print-content';

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
      <PrintContent />
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
