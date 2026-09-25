import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PhotoAttachments } from '@/components/labs/photo-attachments';
import type { SavedPhoto } from '@/lib/schemas/photos';

// IndexedDB and canvas encoding are the browser's; here they are stood in for, and the E2E spec runs them.
const storage = vi.hoisted(() => ({
  photos: [] as SavedPhoto[],
  failAdd: null as Error | null,
  unavailable: false,
}));

vi.mock('@/lib/photo-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/photo-storage')>();
  return {
    ...actual,
    listPhotos: vi.fn(async (tool: string, ownerId: string) => {
      if (storage.unavailable) throw new Error('IndexedDB is not available');
      return {
        photos: storage.photos.filter((photo) => photo.tool === tool && photo.ownerId === ownerId),
        discarded: 0,
      };
    }),
    photoOwnerTicket: vi.fn(async (tool: string, ownerId: string) => ({
      tool,
      ownerId,
      toolDeletions: 0,
      ownerDeletions: 0,
    })),
    addPhoto: vi.fn(async (photo: SavedPhoto) => {
      if (storage.failAdd) throw storage.failAdd;
      storage.photos.push(photo);
    }),
    deletePhoto: vi.fn(async (id: string) => {
      storage.photos = storage.photos.filter((photo) => photo.id !== id);
    }),
  };
});

vi.mock('@/lib/photo-resize', () => ({
  preparePhoto: vi.fn(async (file: File) =>
    file.type.startsWith('image/') ? { data: new ArrayBuffer(4), width: 1600, height: 1200 } : null,
  ),
}));

const saved = (id: string): SavedPhoto => ({
  id,
  tool: 'hunting-log',
  ownerId: 'outing-1',
  type: 'image/jpeg',
  data: new ArrayBuffer(4),
  width: 40,
  height: 30,
  addedAt: '2026-09-24T00:00:00.000Z',
});

const savedIn = 'nilay-labs-hunting-log-v1';

const renderPhotos = () =>
  render(
    <PhotoAttachments
      language="ja"
      tool="hunting-log"
      ownerId="outing-1"
      savedIn={savedIn}
      ownerLabel="11月1日の記録"
    />,
  );

const choose = (...files: File[]) =>
  fireEvent.change(screen.getByLabelText('11月1日の記録に写真を追加'), { target: { files } });

describe('PhotoAttachments', () => {
  beforeEach(() => {
    storage.photos = [];
    storage.failAdd = null;
    storage.unavailable = false;
    URL.createObjectURL = vi.fn(() => 'blob:photo');
    URL.revokeObjectURL = vi.fn();
  });

  it('lists the photos of its own record only', async () => {
    storage.photos = [saved('a'), { ...saved('b'), ownerId: 'outing-2' }];
    renderPhotos();
    expect(await screen.findByRole('button', { name: '写真 1 を拡大' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '写真 2 を拡大' })).not.toBeInTheDocument();
    expect(screen.getByText(/1\/10 枚/)).toBeInTheDocument();
  });

  it('adds the chosen photos, scaled and re-encoded, and says how many', async () => {
    renderPhotos();
    await waitFor(() => expect(screen.getByLabelText('11月1日の記録に写真を追加')).toBeEnabled());
    choose(new File(['x'], 'a.jpg', { type: 'image/jpeg' }), new File(['y'], 'b.png', { type: 'image/png' }));
    expect(await screen.findByText('写真を 2 枚追加しました。')).toBeInTheDocument();
    expect(storage.photos).toHaveLength(2);
    expect(storage.photos[0]).toMatchObject({
      tool: 'hunting-log',
      ownerId: 'outing-1',
      type: 'image/jpeg',
      width: 1600,
    });
    expect(screen.getAllByRole('button', { name: /を拡大$/ })).toHaveLength(2);
  });

  it('says so when a file is not a picture', async () => {
    renderPhotos();
    await waitFor(() => expect(screen.getByLabelText('11月1日の記録に写真を追加')).toBeEnabled());
    choose(new File(['x'], 'notes.txt', { type: 'text/plain' }));
    expect(await screen.findByText(/画像として読み込めないファイルがありました/)).toBeInTheDocument();
    expect(storage.photos).toHaveLength(0);
  });

  it('names the limit when a record is full', async () => {
    const { PhotoLimitError } = await import('@/lib/photo-storage');
    storage.failAdd = new PhotoLimitError();
    renderPhotos();
    await waitFor(() => expect(screen.getByLabelText('11月1日の記録に写真を追加')).toBeEnabled());
    choose(new File(['x'], 'a.jpg', { type: 'image/jpeg' }));
    expect(await screen.findByText('写真は 1 件の記録に 10 枚までです。')).toBeInTheDocument();
  });

  it('enlarges a photo and deletes it after asking', async () => {
    storage.photos = [saved('a')];
    renderPhotos();
    fireEvent.click(await screen.findByRole('button', { name: '写真 1 を拡大' }));
    expect(screen.getByRole('img', { name: '11月1日の記録の写真 1' })).toBeInTheDocument();
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: '写真 1 を削除' }));
    expect(await screen.findByText('写真を削除しました。')).toBeInTheDocument();
    expect(storage.photos).toEqual([]);
    expect(screen.queryByRole('img', { name: '11月1日の記録の写真 1' })).not.toBeInTheDocument();
  });

  it('says photos cannot be kept where the browser has no storage for them', async () => {
    storage.unavailable = true;
    renderPhotos();
    expect(await screen.findByText(/このブラウザーでは写真を保存できません/)).toBeInTheDocument();
    expect(screen.getByLabelText('11月1日の記録に写真を追加')).toBeDisabled();
  });
});
