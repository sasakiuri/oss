import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CameraCapture } from '@/components/labs';

/** The camera as the page sees it: a stream of tracks that can be asked to stop. */
const fakeCamera = (behaviour: 'grants' | 'refuses' | 'absent') => {
  // jsdom has no media playback, and its stand-in writes to the console rather than returning.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const getUserMedia = vi.fn(() =>
    behaviour === 'grants' ? Promise.resolve(stream) : Promise.reject(new DOMException('no', 'NotAllowedError')),
  );
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: behaviour === 'absent' ? undefined : { getUserMedia },
  });
  return { track, getUserMedia };
};

/**
 * jsdom has no canvas, so the shutter is given one: a drawing context that does nothing and a
 * `toBlob` that hands back its callback instead of calling it, which is what lets a test decide
 * when the encoding finishes and what has happened by then.
 */
const stubCanvas = () => {
  const pending: BlobCallback[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback: BlobCallback) => {
    pending.push(callback);
  });
  return {
    finish: () => act(() => pending.forEach((callback) => callback(new Blob(['x'], { type: 'image/jpeg' })))),
  };
};

/** A preview that has a frame in it, which is what the shutter checks before it fires. */
const givePreviewAFrame = () => {
  const video = screen.getByLabelText('プレビュー');
  Object.defineProperty(video, 'videoWidth', { configurable: true, value: 640 });
  Object.defineProperty(video, 'videoHeight', { configurable: true, value: 480 });
};

const open = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'カメラで撮影する' }));
  });
};

describe('taking the photo in the page', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'mediaDevices');
  });

  it('opens the preview and offers a shutter', async () => {
    const { getUserMedia } = fakeCamera('grants');
    render(<CameraCapture language="ja" label="プレビュー" onCapture={vi.fn()} />);
    await open();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '撮影する' })).toBeInTheDocument();
    expect(screen.getByLabelText('プレビュー')).toBeInTheDocument();
    expect(screen.getByText('カメラを起動しました。')).toBeInTheDocument();
  });

  it('stops the camera when the preview is closed', async () => {
    const { track } = fakeCamera('grants');
    render(<CameraCapture language="ja" label="プレビュー" onCapture={vi.fn()} />);
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'カメラを閉じる' }));
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('プレビュー')).not.toBeInTheDocument();
  });

  it('stops the camera when the screen goes away', async () => {
    const { track } = fakeCamera('grants');
    const view = render(<CameraCapture language="ja" label="プレビュー" onCapture={vi.fn()} />);
    await open();
    view.unmount();
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('says the camera was refused, and offers to try again', async () => {
    fakeCamera('refuses');
    render(<CameraCapture language="ja" label="プレビュー" onCapture={vi.fn()} />);
    await open();
    expect(screen.getByText(/カメラの使用が許可されていません/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'カメラで撮影する' })).toBeEnabled();
  });

  it('points at the file picker where there is no camera to open', async () => {
    fakeCamera('absent');
    render(<CameraCapture language="en" label="Preview" onCapture={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Use the camera' }));
    });
    expect(screen.getByText(/Choose a photo from a file instead/)).toBeInTheDocument();
  });
});

describe('the moment between the shutter and the file', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'mediaDevices');
  });

  it('hands over the photo once the encoding finishes', async () => {
    fakeCamera('grants');
    const canvas = stubCanvas();
    const onCapture = vi.fn();
    render(<CameraCapture language="ja" label="プレビュー" onCapture={onCapture} />);
    await open();
    givePreviewAFrame();
    fireEvent.click(screen.getByRole('button', { name: '撮影する' }));
    expect(onCapture).not.toHaveBeenCalled();
    expect(screen.getByText('撮影した写真を書き出しています…')).toBeInTheDocument();
    canvas.finish();
    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(onCapture.mock.calls[0]?.[0]).toBeInstanceOf(File);
  });

  it('drops a frame that finishes after the camera was closed', async () => {
    fakeCamera('grants');
    const canvas = stubCanvas();
    const onCapture = vi.fn();
    render(<CameraCapture language="ja" label="プレビュー" onCapture={onCapture} />);
    await open();
    givePreviewAFrame();
    fireEvent.click(screen.getByRole('button', { name: '撮影する' }));
    fireEvent.click(screen.getByRole('button', { name: 'カメラを閉じる' }));
    canvas.finish();
    expect(onCapture).not.toHaveBeenCalled();
  });

  it('drops a frame that finishes after the screen has gone', async () => {
    fakeCamera('grants');
    const canvas = stubCanvas();
    const onCapture = vi.fn();
    const view = render(<CameraCapture language="ja" label="プレビュー" onCapture={onCapture} />);
    await open();
    givePreviewAFrame();
    fireEvent.click(screen.getByRole('button', { name: '撮影する' }));
    view.unmount();
    canvas.finish();
    expect(onCapture).not.toHaveBeenCalled();
  });
});
