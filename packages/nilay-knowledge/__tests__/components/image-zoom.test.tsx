import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it } from 'vitest';

import { ImageZoom } from '@/components/image-zoom';

const markup =
  '<img src="/diagram.png" alt="手続きの流れ"><a href="/original.png"><img src="/linked.png" alt="原寸画像"></a><img src="/decoration.png" alt="">';

function Content({ enhance = true }: { enhance?: boolean }) {
  return (
    <>
      <div className="prose" dangerouslySetInnerHTML={{ __html: markup }} />
      {enhance && <ImageZoom />}
    </>
  );
}

describe('image enlargement', () => {
  it('keeps detailed image explanations available inside the modal', () => {
    render(
      <>
        <div
          className="prose"
          dangerouslySetInnerHTML={{
            __html:
              '<img src="/comparison.png" alt="頭部の比較" aria-details="comparison-description"><p id="comparison-description">図にある模様と色の詳しい説明。</p>',
          }}
        />
        <ImageZoom />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: '頭部の比較を拡大' }));
    const dialog = screen.getByRole('dialog', { name: '画像を拡大' });
    expect(dialog).toHaveAccessibleDescription('図にある模様と色の詳しい説明。');
    expect(within(dialog).getByRole('img')).toHaveAccessibleName('頭部の比較');
  });

  it('offers a named button for informative images and restores focus after Escape', async () => {
    render(<Content />);
    const opener = screen.getByRole('button', { name: '手続きの流れを拡大' });
    expect(opener).toHaveAttribute('aria-haspopup', 'dialog');
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: '画像を拡大' });
    expect(within(dialog).getByRole('img', { name: '手続きの流れ' })).toHaveAttribute(
      'src',
      new URL('/diagram.png', window.location.href).href,
    );
    expect(within(dialog).getByRole('button', { name: '拡大画像を閉じる' })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it('leaves linked images and decorative images outside the zoom interaction', () => {
    render(<Content />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    const link = screen.getByRole('link', { name: '原寸画像' });
    expect(link).toHaveAttribute('href', '/original.png');
    expect(screen.getByRole('presentation')).toHaveAttribute('alt', '');
  });

  it('closes with its button and cleans up enhancements on unmount', async () => {
    const { rerender } = render(
      <StrictMode>
        <Content />
      </StrictMode>,
    );
    const opener = screen.getByRole('button', { name: '手続きの流れを拡大' });
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole('button', { name: '拡大画像を閉じる' }));
    await waitFor(() => expect(opener).toHaveFocus());
    rerender(
      <StrictMode>
        <Content enhance={false} />
      </StrictMode>,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: '手続きの流れ' })).toBeInTheDocument();
  });
});
