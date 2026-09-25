import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TRAP_CHECK_LOG_STORAGE_KEY, useTrapCheckLogStore } from '@/app/(standalone)/labs/trap-check-log/_store';
import { TrapCheckLogClient } from '@/app/(standalone)/labs/trap-check-log/trap-check-log-client';
import { useStorageStatus } from '@/lib/browser-storage';
import { useRecovery } from '@/lib/labs-session';
import type { Trap } from '@/lib/schemas/trap-check-log';
import { useLanguageStore } from '@/store';

import { fakeIndexedDb, installFakeIndexedDb } from '../support/fake-indexeddb';

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

// The shared photo storage runs as written, on an in-memory IndexedDB; only the canvas that shrinks a
// picture, which jsdom lacks, is stood in for, and held until the test lets it finish.
installFakeIndexedDb();
configure({ asyncUtilTimeout: 10_000 });
const preparation = vi.hoisted(() => ({ started: false, finish: () => undefined as void }));
vi.mock('@/lib/photo-resize', () => ({
  preparePhoto: vi.fn(async () => {
    await new Promise<void>((resolve) => {
      preparation.finish = resolve;
      preparation.started = true;
    });
    return { data: new ArrayBuffer(4), width: 40, height: 30 };
  }),
}));

const stored = () => {
  const records = fakeIndexedDb.databases.get('nilay-labs-photos-v1')?.stores.get('photos')?.records;
  return [...(records?.values() ?? [])]
    .map(({ value }) => value as { tool: string; ownerId: string })
    .filter((photo) => photo.tool === 'trap-check-log');
};

const trap = (id: string, name: string): Trap => ({
  id,
  name,
  kind: 'kukuri',
  installedAt: '2026-09-20T06:00',
  location: '',
  latitude: null,
  longitude: null,
  removedAt: null,
  checks: [],
});

async function recordRoundWithPhoto() {
  window.localStorage.setItem(
    TRAP_CHECK_LOG_STORAGE_KEY,
    JSON.stringify({ state: { intervalHours: 24, traps: [trap('t1', '沢 1 号')] }, version: 0 }),
  );
  const { container } = render(<TrapCheckLogClient />);
  await waitFor(() => expect(container.querySelector('[aria-busy]')).toHaveAttribute('aria-busy', 'false'));
  const card = screen.getByRole('group', { name: '沢 1 号' });
  fireEvent.click(within(card).getByRole('button', { name: '見回りを記録' }));
  fireEvent.change(within(card).getByLabelText('写真（任意）'), {
    target: { files: [new File(['x'], 'round.jpg', { type: 'image/jpeg' })] },
  });
  fireEvent.click(within(card).getByRole('button', { name: '記録する' }));
  // The round is saved at once; its photo is still being scaled down.
  await waitFor(() => expect(useTrapCheckLogStore.getState().traps[0]?.checks).toHaveLength(1));
  return card;
}

/** Lets the photo go on and waits long enough for any write of it to land. */
async function finishPreparation() {
  // The photo is prepared only once its ticket is read, and not at all for a round already deleted then.
  for (let wait = 0; wait < 50 && !preparation.started; wait += 1)
    await new Promise((resolve) => setTimeout(resolve, 20));
  preparation.finish();
  await new Promise((resolve) => setTimeout(resolve, 100));
}

describe('a round’s photo still being prepared when records are deleted', { timeout: 30_000 }, () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-22T12:00:00'));
    preparation.started = false;
    useTrapCheckLogStore.setState(useTrapCheckLogStore.getInitialState(), true);
    window.localStorage.clear();
    fakeIndexedDb.databases.get('nilay-labs-photos-v1')?.stores.get('photos')?.records.clear();
    useRecovery.setState({ result: 'none' });
    useStorageStatus.setState({ available: true, discarded: [] });
    useLanguageStore.setState({ language: 'ja' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    URL.createObjectURL = vi.fn(() => 'blob:photo');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps no photo of the round deleted meanwhile', async () => {
    const card = await recordRoundWithPhoto();
    fireEvent.click(within(card).getByText('見回りの記録（1 件）'));
    fireEvent.click(within(card).getByRole('button', { name: /の記録を削除$/ }));
    await waitFor(() => expect(useTrapCheckLogStore.getState().traps[0]?.checks).toHaveLength(0));
    await finishPreparation();
    expect(stored()).toEqual([]);
  });

  it('keeps no photo of a round whose trap was deleted meanwhile', async () => {
    const card = await recordRoundWithPhoto();
    fireEvent.click(within(card).getByRole('button', { name: 'このわなを削除' }));
    await waitFor(() => expect(useTrapCheckLogStore.getState().traps).toHaveLength(0));
    await finishPreparation();
    expect(stored()).toEqual([]);
  });

  it('keeps no photo when every record was deleted meanwhile', async () => {
    await recordRoundWithPhoto();
    fireEvent.click(screen.getByRole('button', { name: /この端末への保存/ }));
    fireEvent.click(screen.getByRole('button', { name: '記録をすべて削除' }));
    await waitFor(() => expect(useTrapCheckLogStore.getState().traps).toHaveLength(0));
    await finishPreparation();
    expect(stored()).toEqual([]);
  });

  it('still keeps the photo of a round nobody deleted', async () => {
    await recordRoundWithPhoto();
    await finishPreparation();
    await waitFor(() => expect(stored()).toHaveLength(1));
  });
});
