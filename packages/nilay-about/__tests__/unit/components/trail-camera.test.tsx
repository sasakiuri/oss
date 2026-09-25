import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTrailCameraStore } from '@/app/(standalone)/labs/trail-camera/_store';
import { TrailCameraClient } from '@/app/(standalone)/labs/trail-camera/trail-camera-client';
import { useStorageStatus } from '@/lib/browser-storage';
import { useLanguageStore } from '@/store';

vi.mock('@/lib/exif', () => ({
  // The file's first byte stands for its hour; 255 for a photo without a time.
  readExifTime: (bytes: Uint8Array) =>
    bytes[0] === 255
      ? null
      : {
          year: 2026,
          month: 11,
          day: 15,
          hour: bytes[0],
          minute: 0,
          second: 0,
          offsetMinutes: null,
          source: 'original',
        },
}));

vi.mock('@/components/labs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/labs')>();
  const { createElement } = await import('react');
  return {
    ...actual,
    AppLayout: ({ header, children }: { header: ReactNode; children: ReactNode }) =>
      createElement('div', null, header, children),
    AppHeader: ({ title, actions }: { title: string; actions?: ReactNode }) =>
      createElement('header', null, title, actions),
    LanguageMenu: () => null,
  };
});

const loaded = () => waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
const photo = (name: string, hour: number) => new File([new Uint8Array([hour, 0, 0])], name, { type: 'image/jpeg' });

describe('the trail camera counts', () => {
  beforeEach(() => {
    useTrailCameraStore.setState(useTrailCameraStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
    useLanguageStore.setState({ language: 'ja' });
  });

  it('counts the photos by hour and lists those without a time', async () => {
    render(<TrailCameraClient />);
    await loaded();
    fireEvent.change(screen.getByLabelText('写真・ZIP を選ぶ'), {
      target: { files: [photo('a.jpg', 5), photo('b.jpg', 5), photo('c.jpg', 22), photo('d.jpg', 255)] },
    });
    expect(await screen.findByText('撮影時刻を読めた写真 3 枚、読めなかったファイル 1 件。')).toBeInTheDocument();
    expect(screen.getByText('5:00–6:00')).toBeInTheDocument();
    expect(screen.queryByText('日の出からの時間')).toBeNull();
  });

  it('moves the counts with the clock correction', async () => {
    render(<TrailCameraClient />);
    await loaded();
    fireEvent.change(screen.getByLabelText('写真・ZIP を選ぶ'), { target: { files: [photo('a.jpg', 5)] } });
    await screen.findByText('5:00–6:00');
    fireEvent.change(screen.getByLabelText(/時計の補正/), { target: { value: '-60' } });
    expect(screen.getByText('4:00–5:00')).toBeInTheDocument();
  });
});
