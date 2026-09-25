import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGibierRecordStore } from '@/app/(standalone)/labs/gibier-record/_store';
import { GibierRecordClient } from '@/app/(standalone)/labs/gibier-record/gibier-record-client';
import { useStorageStatus } from '@/lib/browser-storage';
import { useRecovery } from '@/lib/labs-session';
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
// picture, which jsdom lacks, is stood in for.
installFakeIndexedDb();
// The in-memory database answers a turn of the event loop at a time, slowly when the whole suite runs.
configure({ asyncUtilTimeout: 10_000 });
// Spied on by the tests of what happens when the photos cannot be read.
vi.mock('@/lib/photo-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/photo-storage')>()),
}));
vi.mock('@/lib/photo-resize', () => ({
  preparePhoto: vi.fn(async (file: Blob) =>
    file.type.startsWith('image/') ? { data: new ArrayBuffer(4), width: 40, height: 30 } : null,
  ),
}));

/** The photos the shared storage holds for the capture records, by record. */
const stored = () => {
  const records = fakeIndexedDb.databases.get('nilay-labs-photos-v1')?.stores.get('photos')?.records;
  return [...(records?.values() ?? [])]
    .map(({ value }) => value as { tool: string; ownerId: string })
    .filter((photo) => photo.tool === 'gibier-record');
};

const renderTool = async () => {
  const view = render(<GibierRecordClient />);
  await waitFor(() => expect(view.container.querySelector('[aria-busy="true"]')).toBeNull());
  return view;
};

beforeEach(() => {
  useLanguageStore.setState({ language: 'ja' });
  useGibierRecordStore.setState(useGibierRecordStore.getInitialState(), true);
  window.localStorage.clear();
  fakeIndexedDb.databases.get('nilay-labs-photos-v1')?.stores.get('photos')?.records.clear();
  useRecovery.setState({ result: 'none' });
  useStorageStatus.setState({ available: true, discarded: [] });
  let counter = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:test-${(counter += 1)}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

const current = () => {
  const state = useGibierRecordStore.getState();
  return state.records.find((record) => record.id === state.currentId)!;
};

describe('the individual number', () => {
  it('prints the number and its QR code on the sheet', async () => {
    const { container } = await renderTool();
    fireEvent.change(screen.getByLabelText('個体番号'), { target: { value: 'A-12' } });
    const sheet = container.querySelector('[class*="sheet"]') as HTMLElement;
    expect(sheet).toHaveTextContent('個体番号：A-12');
    const code = within(sheet).getByRole('img', { name: '個体番号 A-12 の QR コード' });
    // Version 1 with the quiet zone: 21 + 8 modules.
    expect(code).toHaveAttribute('viewBox', '0 0 29 29');
  });
});

describe('the position', () => {
  it('records the device position and prints it beside the place', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({ coords: { latitude: 35.6812359, longitude: 139.7671248, accuracy: 12.4 } } as GeolocationPosition),
    );
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
    const { container } = await renderTool();
    fireEvent.click(screen.getByRole('button', { name: '現在地を記録する' }));
    expect(current()).toMatchObject({ latitude: '35.681236', longitude: '139.767125', locationAccuracyM: '12' });
    expect(screen.getByText('緯度・経度 35.681236, 139.767125（誤差 約 12 m）')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '地理院地図で確認する' })).toHaveAttribute(
      'href',
      'https://maps.gsi.go.jp/#16/35.681236/139.767125/',
    );
    expect(container.querySelector('[class*="sheet"]')).toHaveTextContent('緯度・経度 35.681236, 139.767125');
  });

  it('says so when the position is refused', async () => {
    const getCurrentPosition = vi.fn((_success: PositionCallback, failure: PositionErrorCallback) =>
      failure({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError),
    );
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
    await renderTool();
    fireEvent.click(screen.getByRole('button', { name: '現在地を記録する' }));
    expect(screen.getByText(/位置情報の使用が許可されていません/)).toBeInTheDocument();
    // Nothing recorded: the position stays absent, which the screen shows as 未記録.
    expect(current().latitude).toBeUndefined();
    expect(screen.getByText('未記録')).toBeInTheDocument();
  });
});

describe('photos', { timeout: 30_000 }, () => {
  const choose = (files: File[]) => {
    const input = screen.getByLabelText('この個体に写真を追加');
    fireEvent.change(input, { target: { files } });
  };
  const image = (name: string) => new File(['x'], name, { type: 'image/jpeg' });

  it('keeps up to four photos under the record in the shared storage, prints them, and deletes them with it', async () => {
    const { container } = await renderTool();
    const recordId = current().id;
    choose([image('1.jpg'), image('2.jpg'), image('3.jpg'), image('4.jpg'), image('5.jpg')]);
    expect(await screen.findByText('写真は 1 件の記録に 4 枚までです。')).toBeInTheDocument();
    expect(stored()).toHaveLength(4);
    expect(stored().every((photo) => photo.ownerId === recordId)).toBe(true);
    // The saved record does not list them: they are found by its id.
    expect(current()).not.toHaveProperty('photoIds');
    await waitFor(() => expect(container.querySelectorAll('[class*="photoGrid"] img')).toHaveLength(4));
    expect(screen.getByLabelText('この個体に写真を追加')).toBeDisabled();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: '写真 1 を削除' }));
    await waitFor(() => expect(stored()).toHaveLength(3));
    await waitFor(() => expect(container.querySelectorAll('[class*="photoGrid"] img')).toHaveLength(3));

    fireEvent.click(screen.getByRole('button', { name: /の記録を削除$/ }));
    await waitFor(() => expect(stored()).toHaveLength(0));
  });

  it('reports a file that is not a picture', async () => {
    await renderTool();
    choose([new File(['x'], 'notes.txt', { type: 'text/plain' })]);
    expect(await screen.findByText(/画像として読み込めないファイルがありました/)).toBeInTheDocument();
    expect(stored()).toHaveLength(0);
  });

  it('neither adds nor deletes a photo while a restore cut short waits to be settled', async () => {
    await renderTool();
    choose([image('1.jpg')]);
    await waitFor(() => expect(stored()).toHaveLength(1));
    // An undo that fails leaves the tools read-only: the photos must stay as the undo will find them.
    useRecovery.setState({ result: 'failed' });
    choose([image('2.jpg')]);
    expect(await screen.findByText(/写真を保存できませんでした/)).toBeInTheDocument();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(await screen.findByRole('button', { name: '写真 1 を削除' }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(stored()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /^この端末への保存/ }));
    fireEvent.click(screen.getByRole('button', { name: 'すべての記録を削除' }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(stored()).toHaveLength(1);
  });
});

describe('photos being prepared while the records are deleted', { timeout: 30_000 }, () => {
  const image = (name: string) => new File(['x'], name, { type: 'image/jpeg' });

  /** Holds the next photo in preparation (scaling it down) until the returned function is called. */
  const holdPreparation = async () => {
    const resize = await import('@/lib/photo-resize');
    let finish: () => void = () => undefined;
    const prepared = new Promise<void>((resolve) => (finish = resolve));
    vi.mocked(resize.preparePhoto).mockImplementationOnce(async () => {
      await prepared;
      return { data: new ArrayBuffer(4), width: 40, height: 30 };
    });
    return () => finish();
  };

  /** Lets the photo held in preparation go on, and waits for the field to be done with it. */
  const release = async (finish: () => void) => {
    finish();
    await waitFor(() => expect(screen.getByLabelText('この個体に写真を追加')).toBeEnabled());
    await new Promise((resolve) => setTimeout(resolve, 50));
  };

  it('keeps no photo of a record deleted with every record while the photo was being prepared', async () => {
    const finish = await holdPreparation();
    await renderTool();
    fireEvent.change(screen.getByLabelText('この個体に写真を追加'), { target: { files: [image('1.jpg')] } });
    // The record is saved before its photo is prepared.
    await waitFor(() => expect(window.localStorage.getItem('nilay-labs-gibier-record-v1')).not.toBeNull());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /^この端末への保存/ }));
    fireEvent.click(screen.getByRole('button', { name: 'すべての記録を削除' }));
    expect(await screen.findByText('すべての記録を削除しました。')).toBeInTheDocument();
    await release(finish);
    expect(stored()).toEqual([]);
  });

  it('keeps no photo of the record cleared on screen while the photo was being prepared', async () => {
    const finish = await holdPreparation();
    await renderTool();
    fireEvent.change(screen.getByLabelText('この個体に写真を追加'), { target: { files: [image('1.jpg')] } });
    await waitFor(() => expect(window.localStorage.getItem('nilay-labs-gibier-record-v1')).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: '入力を初期値に戻す' }));
    fireEvent.click(screen.getByRole('button', { name: '初期値に戻す' }));
    expect(await screen.findByText('表示中の記録を空にしました。')).toBeInTheDocument();
    await release(finish);
    expect(stored()).toEqual([]);
  });
});

describe('photos and the saved record', { timeout: 30_000 }, () => {
  const choose = (files: File[]) =>
    fireEvent.change(screen.getByLabelText('この個体に写真を追加'), { target: { files } });
  const image = (name: string) => new File(['x'], name, { type: 'image/jpeg' });

  it('saves an untouched record before its first photo, so a reload finds the photo with it', async () => {
    await renderTool();
    const recordId = current().id;
    // Nothing typed yet: the record exists only on screen until the photo is added.
    expect(window.localStorage.getItem('nilay-labs-gibier-record-v1')).toBeNull();
    choose([image('1.jpg')]);
    await waitFor(() => expect(stored()).toHaveLength(1));
    const saved = JSON.parse(window.localStorage.getItem('nilay-labs-gibier-record-v1')!) as {
      state: { records: { id: string }[]; currentId: string };
    };
    expect(saved.state.currentId).toBe(recordId);
    expect(saved.state.records.map((record) => record.id)).toContain(recordId);
  });

  it('adds no photo when the record cannot be saved', async () => {
    await renderTool();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    choose([image('1.jpg')]);
    expect(
      await screen.findByText(/記録をこのブラウザーに保存できなかったため、写真は追加していません/),
    ).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(stored()).toHaveLength(0);
  });

  it('keeps the photos when deleting the record did not reach storage', async () => {
    await renderTool();
    choose([image('1.jpg')]);
    await waitFor(() => expect(stored()).toHaveLength(1));
    // The record's removal cannot be written: on the next visit it comes back, and so must its photo.
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === 'nilay-labs-gibier-record-v1') throw new DOMException('full', 'QuotaExceededError');
      setItem.call(this, key, value);
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /の記録を削除$/ }));
    expect(await screen.findByText(/写真は残しています/)).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(stored()).toHaveLength(1);
  });

  it('prints only once the photos are read and drawn', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    let drawn: () => void = () => undefined;
    // jsdom does not draw pictures, so it has no decode; a browser does.
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: () => new Promise<void>((resolve) => (drawn = resolve)),
    });
    await renderTool();
    choose([image('1.jpg')]);
    await waitFor(() => expect(stored()).toHaveLength(1));
    // The sheet shows the photo once it is read back; before that there is nothing to wait for.
    await waitFor(() => expect(document.querySelector('[data-gibier-sheet] img')).not.toBeNull());
    const button = await screen.findByRole('button', { name: 'この 1 頭を印刷する' });
    fireEvent.click(button);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(print).not.toHaveBeenCalled();
    drawn();
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
  });

  it('holds the print button while the photos are still being read', async () => {
    const photos = await import('@/lib/photo-storage');
    let answer: () => void = () => undefined;
    const list = photos.listPhotos;
    vi.spyOn(photos, 'listPhotos').mockImplementation(async (tool, owner) => {
      await new Promise<void>((resolve) => (answer = resolve));
      return list(tool, owner);
    });
    render(<GibierRecordClient />);
    expect(await screen.findByRole('button', { name: '写真を読み込んでいます…' })).toBeDisabled();
    answer();
    expect(await screen.findByRole('button', { name: 'この 1 頭を印刷する' })).toBeEnabled();
  });

  it('does not take photos it could not read for a sheet ready to print, and reads them again on request', async () => {
    const photos = await import('@/lib/photo-storage');
    const list = photos.listPhotos;
    const read = vi.spyOn(photos, 'listPhotos').mockRejectedValue(new Error('IndexedDB is not available'));
    render(<GibierRecordClient />);
    expect(await screen.findByRole('button', { name: '写真を読み込めませんでした' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'この 1 頭を印刷する' })).not.toBeInTheDocument();
    read.mockImplementation(list);
    fireEvent.click(screen.getByRole('button', { name: '写真を読み込み直す' }));
    expect(await screen.findByRole('button', { name: 'この 1 頭を印刷する' })).toBeEnabled();
  });

  it('prints without the photos it could not read only when asked to', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const photos = await import('@/lib/photo-storage');
    vi.spyOn(photos, 'listPhotos').mockRejectedValue(new Error('IndexedDB is not available'));
    render(<GibierRecordClient />);
    fireEvent.click(await screen.findByRole('button', { name: '写真なしで印刷する' }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
  });

  it('writes the CSV of the records even when the photos cannot be read, leaving their count blank', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const photos = await import('@/lib/photo-storage');
    await renderTool();
    vi.spyOn(photos, 'listPhotos').mockRejectedValue(new Error('IndexedDB is not available'));
    fireEvent.click(screen.getByRole('button', { name: 'すべての記録を CSV で書き出す' }));
    expect(await screen.findByText(/写真の枚数は空欄です/)).toBeInTheDocument();
    expect(click).toHaveBeenCalledTimes(1);
  });
});

describe('CSV export', () => {
  it('downloads every record as a CSV file', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await renderTool();
    fireEvent.click(screen.getByRole('button', { name: '次の 1 頭を記録する' }));
    fireEvent.click(screen.getByRole('button', { name: 'すべての記録を CSV で書き出す' }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    const link = click.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toMatch(/^gibier-records-\d{8}\.csv$/);
    expect(await screen.findByText('2 頭分の記録を CSV で書き出しました。')).toBeInTheDocument();
  });
});

describe('the findings guide', () => {
  it('shows the stage asked for, for the species on the record, with the decision and the source', async () => {
    await renderTool();
    fireEvent.click(within(screen.getByRole('group', { name: '捕獲獣種' })).getByRole('radio', { name: 'シカ' }));
    fireEvent.click(screen.getByRole('button', { name: /^異常の見分け方/ }));
    fireEvent.click(within(screen.getByRole('group', { name: '段階' })).getByRole('radio', { name: '内臓' }));
    const stage = screen.getByRole('region', { name: /^内臓（\d+ 件）$/ });
    expect(stage).toHaveTextContent('寄生虫（肝蛭）');
    expect(stage).toHaveTextContent('その臓器を廃棄');
    expect(stage).toHaveTextContent('出典：カラーアトラス p.16');
    expect(stage).not.toHaveTextContent('ミルクスポット');
  });
});
