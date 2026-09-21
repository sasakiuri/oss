// cspell:words pswp
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  const decode = vi.fn<() => Promise<void>>();

  beforeEach(() => {
    decode.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal('Image', function () {
      const image = document.createElement('img');
      Object.defineProperties(image, {
        naturalWidth: { value: 1600 },
        naturalHeight: { value: 1200 },
        decode: { value: decode },
      });
      return image;
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('keeps detailed image explanations available inside the modal', async () => {
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
    expect(await within(dialog).findByRole('img')).toHaveAccessibleName('頭部の比較');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('offers a named button for informative images and restores focus after Escape', async () => {
    render(<Content />);
    const opener = screen.getByRole('button', { name: '手続きの流れを拡大' });
    expect(opener).toHaveAttribute('aria-haspopup', 'dialog');
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: '画像を拡大' });
    expect(await within(dialog).findByRole('img', { name: '手続きの流れ' })).toHaveAttribute(
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

  it('reports loading failures and allows another attempt after closing', async () => {
    decode.mockRejectedValueOnce(new Error('Image download failed'));
    render(<Content />);
    fireEvent.click(screen.getByRole('button', { name: '手続きの流れを拡大' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('画像を読み込めませんでした');
    expect(screen.getByRole('button', { name: '画像を拡大・縮小' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '拡大画像を閉じる' }));
    fireEvent.click(screen.getByRole('button', { name: '手続きの流れを拡大' }));
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByRole('img')).toHaveAccessibleName('手続きの流れ');
  });

  it('does not create a viewer after closing during image loading', async () => {
    let finish!: () => void;
    decode.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    render(<Content />);
    fireEvent.click(screen.getByRole('button', { name: '手続きの流れを拡大' }));
    expect(screen.getByRole('status')).toHaveTextContent('画像を読み込んでいます');
    fireEvent.click(screen.getByRole('button', { name: '拡大画像を閉じる' }));
    finish();
    await waitFor(() => expect(document.querySelector('.pswp')).not.toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
