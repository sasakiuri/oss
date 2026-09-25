import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OutlinePanel } from '@/app/(standalone)/labs/photo-measure/outline-panel';
import {
  deleteCachedModel,
  downloadModel,
  isModelCached,
  modelCacheAvailable,
  readCachedModel,
} from '@/lib/model-download';
import { OUTLINE_MODEL_FILES, OutlineModel } from '@/lib/outline-model';

vi.mock('@/lib/model-download');
vi.mock('@/lib/outline-model', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/outline-model')>();
  return {
    ...actual,
    OutlineModel: vi.fn(
      class {
        load = vi.fn().mockResolvedValue('webgpu');
        setPhoto = vi.fn().mockResolvedValue(true);
        outline = vi.fn().mockResolvedValue({ mask: new Uint8Array([1]), score: 0.9 });
        dispose = vi.fn();
      },
    ),
  };
});

const props = (): ComponentProps<typeof OutlinePanel> => ({
  language: 'en',
  photo: new Image(),
  prompts: [{ x: 20, y: 30, foreground: true }],
  foreground: true,
  active: true,
  onForegroundChange: vi.fn(),
  onActivate: vi.fn(),
  onDeactivate: vi.fn(),
  onOutline: vi.fn(),
});
const model = () => vi.mocked(OutlineModel).mock.results.at(-1)!.value as OutlineModel;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isModelCached).mockResolvedValue(false);
  vi.mocked(modelCacheAvailable).mockReturnValue(true);
  vi.mocked(readCachedModel).mockResolvedValue(null);
  vi.mocked(deleteCachedModel).mockResolvedValue(undefined);
  vi.mocked(downloadModel).mockImplementation(async (_file, progress) => {
    progress(0.5);
    return { data: new ArrayBuffer(4), kept: true };
  });
});

describe('on-device outline model lifecycle', () => {
  it('waits for consent, encodes a photo once, updates taps, and deletes the model', async () => {
    const callbacks = props();
    const view = render(<OutlinePanel {...callbacks} />);
    await waitFor(() => expect(isModelCached).toHaveBeenCalledTimes(2));
    expect(downloadModel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Download and use/ }));
    await waitFor(() => expect(callbacks.onOutline).toHaveBeenLastCalledWith(expect.objectContaining({ score: 0.9 })));
    expect(downloadModel).toHaveBeenCalledTimes(2);
    expect(model().setPhoto).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('radio', { name: 'Leave out' }));
    expect(callbacks.onForegroundChange).toHaveBeenCalledWith(false);
    const prompts = [...callbacks.prompts, { x: 40, y: 50, foreground: false }];
    view.rerender(<OutlinePanel {...callbacks} prompts={prompts} />);
    await waitFor(() => expect(model().outline).toHaveBeenLastCalledWith(prompts));
    expect(model().setPhoto).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Delete the saved model' }));
    await waitFor(() => expect(deleteCachedModel).toHaveBeenCalledTimes(2));
    expect(model().dispose).toHaveBeenCalledOnce();
    expect(callbacks.onDeactivate).toHaveBeenCalledOnce();
    expect(callbacks.onOutline).toHaveBeenLastCalledWith(null);
    await waitFor(() => expect(screen.getByRole('button', { name: /Download and use/ })).toBeEnabled());
  });

  it('reuses cached files and leaves manual measurement available after a model failure', async () => {
    vi.mocked(isModelCached).mockResolvedValue(true);
    vi.mocked(readCachedModel).mockResolvedValue(new ArrayBuffer(4));
    const callbacks = props();
    const view = render(<OutlinePanel {...callbacks} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Use the saved model' }));
    await waitFor(() => expect(callbacks.onActivate).toHaveBeenCalledOnce());
    await waitFor(() => expect(callbacks.onOutline).toHaveBeenLastCalledWith(expect.objectContaining({ score: 0.9 })));
    expect(downloadModel).not.toHaveBeenCalled();
    vi.mocked(model().setPhoto).mockRejectedValueOnce(new Error('decode failed'));
    view.rerender(<OutlinePanel {...callbacks} photo={new Image()} />);
    await screen.findByText('No outline could be made on this photo. Place the points by hand.');
    view.unmount();
    expect(model().dispose).toHaveBeenCalledOnce();
  });

  it.each(['integrity', 'network'] as const)(
    'reports a %s download failure and removes partial cached files',
    async (reason) => {
      const error = new Error('download failed');
      if (reason === 'integrity') error.name = 'ModelIntegrityError';
      vi.mocked(downloadModel).mockRejectedValueOnce(error);
      vi.mocked(isModelCached).mockImplementation(async (file) => file === OUTLINE_MODEL_FILES.encoder);
      vi.mocked(modelCacheAvailable).mockReturnValue(false);
      render(<OutlinePanel {...props()} />);
      await screen.findByText('This browser cannot keep the model, so it is downloaded each time.');
      fireEvent.click(screen.getByRole('button', { name: /Download and use/ }));
      await screen.findByText(
        reason === 'integrity' ? /downloaded file did not match/ : /model could not be downloaded/,
      );
      expect(OutlineModel).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Delete the saved model' }));
      await waitFor(() => expect(deleteCachedModel).toHaveBeenCalledTimes(2));
    },
  );

  it('aborts an in-flight download when leaving without activating a late result', async () => {
    let finish!: (result: { data: ArrayBuffer; kept: boolean }) => void;
    vi.mocked(downloadModel).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const callbacks = props();
    const view = render(<OutlinePanel {...callbacks} />);
    fireEvent.click(screen.getByRole('button', { name: /Download and use/ }));
    await waitFor(() => expect(downloadModel).toHaveBeenCalledOnce());
    const signal = vi.mocked(downloadModel).mock.calls[0]![2]!;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => finish({ data: new ArrayBuffer(4), kept: true }));
    expect(callbacks.onActivate).not.toHaveBeenCalled();
    expect(OutlineModel).not.toHaveBeenCalled();
  });
});
