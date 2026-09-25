import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TRAP_CHECK_LOG_STORAGE_KEY, useTrapCheckLogStore } from '@/app/(standalone)/labs/trap-check-log/_store';
import { TrapCheckLogClient } from '@/app/(standalone)/labs/trap-check-log/trap-check-log-client';
import { useStorageStatus } from '@/lib/browser-storage';
import type { SavedPhoto } from '@/lib/schemas/photos';
import type { Trap } from '@/lib/schemas/trap-check-log';
import { useLanguageStore } from '@/store';

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

// The shared photo storage, as plain values; its IndexedDB is tested on its own and in the E2E specs.
const storage = vi.hoisted(() => ({
  photos: [] as SavedPhoto[],
  deletedOwners: [] as string[],
  deletedTools: [] as string[],
}));
vi.mock('@/lib/photo-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/photo-storage')>()),
  listPhotos: vi.fn(async (tool: string, ownerId: string) => ({
    photos: storage.photos.filter((photo) => photo.tool === tool && photo.ownerId === ownerId),
    discarded: 0,
  })),
  photoOwnerTicket: vi.fn(async (tool: string, ownerId: string) => ({
    tool,
    ownerId,
    toolDeletions: 0,
    ownerDeletions: 0,
  })),
  addPhoto: vi.fn(async (photo: SavedPhoto) => {
    storage.photos.push(photo);
  }),
  deletePhotosOf: vi.fn(async (tool: string, ownerId: string) => {
    storage.deletedOwners.push(ownerId);
    storage.photos = storage.photos.filter((photo) => !(photo.tool === tool && photo.ownerId === ownerId));
  }),
  deleteToolPhotos: vi.fn(async (tool: string) => {
    storage.deletedTools.push(tool);
    storage.photos = storage.photos.filter((photo) => photo.tool !== tool);
  }),
}));
vi.mock('@/lib/photo-resize', () => ({
  preparePhoto: vi.fn(async () => ({ data: new ArrayBuffer(4), width: 1600, height: 1200 })),
}));

const NOW = new Date('2026-09-22T12:00:00');

const trap = (id: string, name: string, checks: Trap['checks']): Trap => ({
  id,
  name,
  kind: 'kukuri',
  installedAt: '2026-09-20T06:00',
  location: '',
  latitude: null,
  longitude: null,
  removedAt: null,
  checks,
});
const round = (id: string, at: string) => ({ id, at, result: 'nothing' as const, note: '' });
const photo = (id: string, ownerId: string): SavedPhoto => ({
  id,
  tool: 'trap-check-log',
  ownerId,
  type: 'image/jpeg',
  data: new ArrayBuffer(4),
  width: 40,
  height: 30,
  addedAt: '2026-09-22T00:00:00.000Z',
});

const seed = (traps: Trap[]) =>
  window.localStorage.setItem(
    TRAP_CHECK_LOG_STORAGE_KEY,
    JSON.stringify({ state: { intervalHours: 24, traps }, version: 0 }),
  );
const saved = () => JSON.parse(window.localStorage.getItem(TRAP_CHECK_LOG_STORAGE_KEY) ?? 'null');

async function renderReady() {
  const { container } = render(<TrapCheckLogClient />);
  await waitFor(() => expect(container.querySelector('[aria-busy]')).toHaveAttribute('aria-busy', 'false'));
}

describe('photos of rounds', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    useTrapCheckLogStore.setState(useTrapCheckLogStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
    useLanguageStore.setState({ language: 'ja' });
    storage.photos = [];
    storage.deletedOwners = [];
    storage.deletedTools = [];
    URL.createObjectURL = vi.fn(() => 'blob:photo');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => vi.useRealTimers());

  it('keeps a photo taken with a round in the shared photo storage, under that round', async () => {
    seed([trap('t1', '沢 1 号', [])]);
    await renderReady();
    const card = screen.getByRole('group', { name: '沢 1 号' });
    fireEvent.click(within(card).getByRole('button', { name: '見回りを記録' }));
    fireEvent.change(within(card).getByLabelText('写真（任意）'), {
      target: { files: [new File(['x'], 'round.jpg', { type: 'image/jpeg' })] },
    });
    fireEvent.click(within(card).getByRole('button', { name: '記録する' }));
    await waitFor(() => expect(storage.photos).toHaveLength(1));
    const roundId = saved().state.traps[0].checks[0].id as string;
    expect(storage.photos[0]).toMatchObject({ tool: 'trap-check-log', ownerId: roundId, type: 'image/jpeg' });
    // The saved round carries no flag of its own: the photo is found by the round's id.
    expect(saved().state.traps[0].checks[0]).not.toHaveProperty('photo');
  });

  it('shows a round’s photos in its entry, where more can be added and deleted', async () => {
    storage.photos = [photo('p1', 'r1')];
    seed([trap('t1', '沢 1 号', [round('r1', '2026-09-21T10:00')])]);
    await renderReady();
    fireEvent.click(screen.getByText('見回りの記録（1 件）'));
    expect(await screen.findByRole('button', { name: '写真 1 を拡大' })).toBeInTheDocument();
    expect(screen.getByLabelText('2026-09-21 10:00 の見回りに写真を追加')).toBeInTheDocument();
  });

  it('deletes a round’s photos with the round, a trap’s with the trap, and all of them with the log', async () => {
    seed([
      trap('t1', '沢 1 号', [round('r1', '2026-09-21T10:00'), round('r2', '2026-09-21T18:00')]),
      trap('t2', '尾根 2 号', [round('r3', '2026-09-21T11:00')]),
    ]);
    await renderReady();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const first = screen.getByRole('group', { name: '沢 1 号' });
    fireEvent.click(within(first).getByText('見回りの記録（2 件）'));
    fireEvent.click(within(first).getAllByRole('button', { name: /の記録を削除$/ })[0]!);
    await waitFor(() => expect(storage.deletedOwners).toEqual(['r2']));

    fireEvent.click(within(first).getByRole('button', { name: 'このわなを削除' }));
    await waitFor(() => expect(storage.deletedOwners).toEqual(['r2', 'r1']));

    fireEvent.click(screen.getByRole('button', { name: /この端末への保存/ }));
    fireEvent.click(screen.getByRole('button', { name: '記録をすべて削除' }));
    await waitFor(() => expect(storage.deletedTools).toEqual(['trap-check-log']));
    confirm.mockRestore();
  });
});
