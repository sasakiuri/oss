import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { storageKey, useHunterMapStore } from '@/app/(standalone)/labs/hunter-map/_store';
import { HunterMapClient } from '@/app/(standalone)/labs/hunter-map/hunter-map-client';
import { discardedSaveMessage } from '@/components/labs';
import { useStorageStatus } from '@/lib/browser-storage';
import { transverseMercator } from '@/lib/hunter-map';
import { readImageSize } from '@/lib/hunter-map-storage';
import { useLanguageStore } from '@/store';

// jsdom has no IndexedDB, so the storage module is replaced by one record held in memory.
const saved = vi.hoisted(() => ({
  image: undefined as unknown,
  setup: undefined as unknown,
  fail: false,
  cleared: 0,
}));
vi.mock('@/lib/hunter-map-storage', () => ({
  hunterMapDatabaseName: 'nilay-labs-hunter-map-v1',
  readSavedMap: vi.fn(async () => {
    if (saved.fail) throw new Error('blocked');
    return { image: saved.image, setup: saved.setup };
  }),
  writeMapImage: vi.fn(async (image: unknown, setup: unknown) => {
    saved.image = image ?? undefined;
    saved.setup = setup;
  }),
  writeMapSetup: vi.fn(async (setup: unknown) => {
    saved.setup = setup;
  }),
  clearSavedMap: vi.fn(async () => {
    saved.image = undefined;
    saved.setup = undefined;
    saved.cleared += 1;
  }),
  readImageSize: vi.fn(async () => ({ width: 4000, height: 3000 })),
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
    SectionNav: () => null,
  };
});

// A map of 1 px per 10 m around 35.5° N 138.5° E, north up, and two points placed on it.
const origin = { latitude: 35.5, longitude: 138.5 };
const draw = (latitude: number, longitude: number) => {
  const { x, y } = transverseMercator({ latitude, longitude }, origin);
  return { x: Math.round(2000 + y / 10), y: Math.round(1500 - x / 10) };
};
const savedImage = {
  id: 'map-1',
  data: new ArrayBuffer(1),
  type: 'image/png' as const,
  name: 'map.png',
  width: 4000,
  height: 3000,
};
const point = (id: string, latitude: number, longitude: number) => ({
  id,
  ...draw(latitude, longitude),
  latitude: String(latitude),
  longitude: String(longitude),
  accuracy: null,
});

const geolocation = {
  getCurrentPosition: vi.fn(),
  watchPosition: vi.fn(() => 7),
  clearWatch: vi.fn(),
};

// jsdom has no PointerEvent, and without one a pointer event carries no coordinates at all.
if (typeof window.PointerEvent === 'undefined')
  Object.defineProperty(window, 'PointerEvent', {
    value: class PointerEvent extends MouseEvent {},
    configurable: true,
  });

const spokenRegions = () =>
  screen.getAllByRole('status').filter((node) => node.tagName === 'P' && node.className.includes('sr-only'));

// The tool renders from the first paint, held busy until the saved state is read; act only after that.
const loaded = async <T,>(find: () => Promise<T>) => {
  const element = await find();
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
  return element;
};

describe('hunter map', () => {
  beforeEach(() => {
    useHunterMapStore.setState(useHunterMapStore.getInitialState(), true);
    useLanguageStore.setState({ language: 'ja' });
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
    saved.image = undefined;
    saved.setup = undefined;
    saved.fail = false;
    saved.cleared = 0;
    geolocation.getCurrentPosition.mockReset();
    geolocation.watchPosition.mockReset().mockReturnValue(7);
    geolocation.clearWatch.mockReset();
    Object.defineProperty(navigator, 'geolocation', { value: geolocation, configurable: true });
    URL.createObjectURL = vi.fn(() => 'blob:map');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('keeps both spoken regions on the page from the first paint and asks for a map', async () => {
    const { container } = render(<HunterMapClient />);
    // Rendered with the defaults and held busy until the saved map is read.
    expect(container.querySelector('[aria-busy="true"]')).toContainElement(
      screen.getByRole('button', { name: '現在地を表示' }),
    );
    expect(spokenRegions()).toHaveLength(2);
    expect(await loaded(() => screen.findByText('位置図は読み込まれていません。'))).toBeInTheDocument();
    expect(screen.getByText(/区域の正否は保証しません/)).toBeInTheDocument();
  });

  it('turns a PDF away with the way to make a picture of it', async () => {
    render(<HunterMapClient />);
    const input = await loaded(() => screen.findByLabelText('位置図の画像を選ぶ'));
    fireEvent.change(input, { target: { files: [new File(['%PDF'], 'map.pdf', { type: 'application/pdf' })] } });
    expect(await loaded(() => screen.findByText(/PDF は読み込めません/))).toBeInTheDocument();
    expect(useHunterMapStore.getState().image).toBeNull();
  });

  it('saves a chosen picture and waits for the first point to be placed', async () => {
    render(<HunterMapClient />);
    const input = await loaded(() => screen.findByLabelText('位置図の画像を選ぶ'));
    fireEvent.change(input, { target: { files: [new File(['png'], 'area.png', { type: 'image/png' })] } });
    expect(await loaded(() => screen.findByText('「area.png」（4000 × 3000 ピクセル）'))).toBeInTheDocument();
    expect(saved.image).toMatchObject({ name: 'area.png', type: 'image/png' });
    expect((saved.image as { data: ArrayBuffer }).data.byteLength).toBe(3);
    fireEvent.click(screen.getByRole('button', { name: '基準点を追加' }));
    expect(screen.getByText('図の上で基準点 1 の位置をタップしてください。', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('図の上の位置がまだありません。')).toBeInTheDocument();
  });

  it('aligns two saved points by a similarity and says it cannot check them', async () => {
    saved.image = savedImage;
    saved.setup = {
      imageId: 'map-1',
      points: [point('p1', 35.45, 138.45), point('p2', 35.55, 138.56)],
      model: 'affine',
      projection: 'transverse-mercator',
    };
    render(<HunterMapClient />);
    const result = await loaded(() => screen.findByRole('region', { name: '位置合わせと現在地' }));
    expect(within(result).getByText('相似変換')).toBeInTheDocument();
    expect(within(result).getByText(/残差は必ず 0 です/)).toBeInTheDocument();
    await waitFor(
      () => {
        const summary = spokenRegions()[1];
        if (!summary) throw new Error('Expected the settled summary region.');
        expect(summary.textContent).toBe('相似変換、基準点 2 点。');
      },
      { timeout: 2000 },
    );
  });

  it('reports residuals from a third point, and then puts the device on the map', async () => {
    saved.image = savedImage;
    saved.setup = {
      imageId: 'map-1',
      points: [point('p1', 35.45, 138.45), point('p2', 35.55, 138.56), point('p3', 35.44, 138.58)],
      model: 'similarity',
      projection: 'transverse-mercator',
    };
    render(<HunterMapClient />);
    const result = await loaded(() => screen.findByRole('region', { name: '位置合わせと現在地' }));
    // Pixel coordinates were rounded to whole pixels, 10 m each, so the residuals stay within metres.
    const residual = within(result).getByText('残差（RMS・最大）').nextElementSibling;
    expect(residual?.textContent).toMatch(/^\d \/ \d+m$/);

    fireEvent.click(screen.getByRole('button', { name: '現在地を表示' }));
    const [onPosition] = geolocation.watchPosition.mock.calls[0] as unknown as [PositionCallback];
    act(() =>
      onPosition({
        coords: { latitude: 35.5, longitude: 138.5, accuracy: 12 },
        timestamp: 0,
      } as GeolocationPosition),
    );
    expect(screen.getByText('現在地を図の上に表示しています。')).toBeInTheDocument();
    expect(screen.getByText('35.50000, 138.50000')).toBeInTheDocument();
    expect(screen.getByText('±12')).toBeInTheDocument();
    act(() =>
      onPosition({ coords: { latitude: 36.5, longitude: 138.5, accuracy: 12 }, timestamp: 1 } as GeolocationPosition),
    );
    expect(screen.getByText('現在地はこの図の範囲外です。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '現在地の表示を止める' }));
    expect(geolocation.clearWatch).toHaveBeenCalledWith(7);
  });

  it('takes the position off the map when it is no longer followed', async () => {
    saved.image = savedImage;
    saved.setup = {
      imageId: 'map-1',
      points: [point('p1', 35.45, 138.45), point('p2', 35.55, 138.56), point('p3', 35.44, 138.58)],
      model: 'affine',
      projection: 'transverse-mercator',
    };
    const { container } = render(<HunterMapClient />);
    // The button is on the page from the first paint, held inert until the saved map is read.
    await loaded(() => screen.findByRole('img', { name: '位置図' }));
    fireEvent.click(screen.getByRole('button', { name: '現在地を表示' }));
    const [onPosition] = geolocation.watchPosition.mock.calls[0] as unknown as [PositionCallback];
    act(() =>
      onPosition({ coords: { latitude: 35.5, longitude: 138.5, accuracy: 12 }, timestamp: 0 } as GeolocationPosition),
    );
    expect(container.querySelector('[data-testid="accuracy-area"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '現在地の表示を止める' }));
    expect(container.querySelector('[data-testid="accuracy-area"]')).toBeNull();
    expect(screen.queryByText('現在地を図の上に表示しています。')).toBeNull();
    expect(screen.getByText('現在地は表示していません。')).toBeInTheDocument();
    expect(screen.queryByText('35.50000, 138.50000')).toBeNull();
  });

  it('fills a point from the device and asks for the same spot on the map', async () => {
    saved.image = savedImage;
    saved.setup = { imageId: 'map-1', points: [], model: 'affine', projection: 'transverse-mercator' };
    render(<HunterMapClient />);
    fireEvent.click(await loaded(() => screen.findByRole('button', { name: '基準点を追加' })));
    fireEvent.click(screen.getByRole('button', { name: 'いまいる場所を基準点にする' }));
    const [onPosition] = geolocation.getCurrentPosition.mock.calls[0] as unknown as [PositionCallback];
    act(() =>
      onPosition({
        coords: { latitude: 35.123456789, longitude: 138.987654321, accuracy: 8.4 },
        timestamp: 0,
      } as GeolocationPosition),
    );
    expect(screen.getByLabelText('緯度（北緯）')).toHaveValue('35.123457');
    expect(screen.getByLabelText('経度（東経）')).toHaveValue('138.987654');
    expect(screen.getByText(/誤差 ±8 m/)).toBeInTheDocument();
    const [firstPoint] = (saved.setup as { points: { latitude: string }[] }).points;
    if (!firstPoint) throw new Error('Expected a calibration point.');
    expect(firstPoint.latitude).toBe('35.123457');
  });

  it('marks a latitude it cannot read and explains a refused location', async () => {
    saved.image = savedImage;
    saved.setup = {
      imageId: 'map-1',
      points: [point('p1', 35.45, 138.45)],
      model: 'affine',
      projection: 'transverse-mercator',
    };
    render(<HunterMapClient />);
    const latitude = await loaded(() => screen.findByLabelText('緯度（北緯）'));
    fireEvent.change(latitude, { target: { value: '95' } });
    expect(latitude).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('-90 から 90 の角度で入力してください。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '現在地を表示' }));
    const [, onError] = geolocation.watchPosition.mock.calls[0] as unknown as [PositionCallback, PositionErrorCallback];
    act(() =>
      onError({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError),
    );
    expect(screen.getByText(/位置情報が許可されていません/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '現在地を表示' })).toBeInTheDocument();
  });

  it('puts the position button beside the map once there is one, and shows no empty figures', async () => {
    saved.image = savedImage;
    saved.setup = { imageId: 'map-1', points: [], model: 'affine', projection: 'transverse-mercator' };
    render(<HunterMapClient />);
    const map = await loaded(() => screen.findByRole('img', { name: '位置図' }));
    const button = screen.getByRole('button', { name: '現在地を表示' });
    expect(map.closest('.rounded-md')).toContainElement(button);
    const result = screen.getByRole('region', { name: '位置合わせと現在地' });
    expect(within(result).queryByRole('button', { name: '現在地を表示' })).toBeNull();
    expect(within(result).queryByText('緯度・経度')).toBeNull();
  });

  it('drops points saved for another picture and says so', async () => {
    saved.image = savedImage;
    saved.setup = {
      imageId: 'map-0',
      points: [point('p1', 35.45, 138.45)],
      model: 'affine',
      projection: 'transverse-mercator',
    };
    render(<HunterMapClient />);
    // Once in the spoken region and once on the page.
    expect(await screen.findAllByText(discardedSaveMessage('ja'))).toHaveLength(2);
    expect(useHunterMapStore.getState().points).toEqual([]);
    expect(useStorageStatus.getState().discarded).toContain(storageKey);
  });

  it('drops a saved record it cannot read', async () => {
    saved.image = { id: 'map-1', data: 'not bytes' };
    render(<HunterMapClient />);
    // Once in the spoken region and once on the page.
    expect(await screen.findAllByText(discardedSaveMessage('ja'))).toHaveLength(2);
    expect(screen.getByText('位置図は読み込まれていません。')).toBeInTheDocument();
  });

  it('says when the browser cannot keep the map', async () => {
    saved.fail = true;
    render(<HunterMapClient />);
    expect(await loaded(() => screen.findByText(/このブラウザーでは図を保存できません/))).toBeInTheDocument();
  });

  it('deletes the saved map on reset', async () => {
    saved.image = savedImage;
    saved.setup = {
      imageId: 'map-1',
      points: [point('p1', 35.45, 138.45)],
      model: 'affine',
      projection: 'transverse-mercator',
    };
    render(<HunterMapClient />);
    fireEvent.click(await loaded(() => screen.findByRole('button', { name: '入力を初期値に戻す' })));
    fireEvent.click(screen.getByRole('button', { name: '初期値に戻す' }));
    await waitFor(() => expect(saved.cleared).toBe(1));
    expect(screen.getByText('位置図は読み込まれていません。')).toBeInTheDocument();
    expect(screen.queryByLabelText('緯度（北緯）')).toBeNull();
  });

  it('switches to English, including the spoken summary', async () => {
    saved.image = savedImage;
    saved.setup = {
      imageId: 'map-1',
      points: [point('p1', 35.45, 138.45), point('p2', 35.55, 138.56)],
      model: 'affine',
      projection: 'transverse-mercator',
    };
    render(<HunterMapClient />);
    await loaded(() => screen.findByRole('region', { name: '位置合わせと現在地' }));
    act(() => useLanguageStore.getState().setLanguage('en'));
    expect(screen.getByText('Hunting Area Map')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show my position' })).toBeInTheDocument();
    await waitFor(
      () => {
        const summary = spokenRegions()[1];
        if (!summary) throw new Error('Expected the settled summary region.');
        expect(summary.textContent).toBe('Similarity fit on 2 points.');
      },
      { timeout: 2000 },
    );
  });

  it('draws the accuracy of an affine fit as the ellipse it makes, at its true size', async () => {
    // 0.1 px per metre across but 0.025 px per metre down: 100 m is 10 px wide and 2.5 px tall.
    const squashed = (id: string, latitude: number, longitude: number) => {
      const { x, y } = transverseMercator({ latitude, longitude }, origin);
      return {
        id,
        x: 2000 + y / 10,
        y: 1500 - x / 40,
        latitude: String(latitude),
        longitude: String(longitude),
        accuracy: null,
      };
    };
    saved.image = savedImage;
    saved.setup = {
      imageId: 'map-1',
      points: [
        squashed('p1', 35.45, 138.45),
        squashed('p2', 35.55, 138.56),
        squashed('p3', 35.44, 138.58),
        squashed('p4', 35.56, 138.43),
      ],
      model: 'affine',
      projection: 'transverse-mercator',
    };
    const { container } = render(<HunterMapClient />);
    // The button is on the page from the first paint, held inert until the saved map is read.
    await loaded(() => screen.findByRole('img', { name: '位置図' }));
    fireEvent.click(screen.getByRole('button', { name: '現在地を表示' }));
    const [onPosition] = geolocation.watchPosition.mock.calls[0] as unknown as [PositionCallback];
    act(() =>
      onPosition({ coords: { latitude: 35.5, longitude: 138.5, accuracy: 100 }, timestamp: 0 } as GeolocationPosition),
    );
    expect(
      screen.getByText('図上では、長い方の半径 約 10 ピクセル・短い方 約 2.5 ピクセルの楕円です。'),
    ).toBeInTheDocument();
    const area = container.querySelector('[data-testid="accuracy-area"]');
    expect(area).toHaveAttribute('r', '100');
    const [a, b, c, d] = (area?.getAttribute('transform') ?? '').match(/-?[\d.e-]+/g)!.map(Number);
    expect(a).toBeCloseTo(0.1, 4);
    expect(b).toBeCloseTo(0, 4);
    expect(c).toBeCloseTo(0, 4);
    expect(d).toBeCloseTo(0.025, 4);
  });

  it('stops waiting for a tap once both pixels are typed, so a later tap cannot move the point', async () => {
    saved.image = savedImage;
    saved.setup = { imageId: 'map-1', points: [], model: 'affine', projection: 'transverse-mercator' };
    render(<HunterMapClient />);
    fireEvent.click(await loaded(() => screen.findByRole('button', { name: '基準点を追加' })));
    expect(screen.getByText(/図の上で基準点 1 の位置をタップしてください。/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('図上の X（左端からのピクセル）'), { target: { value: '120' } });
    // One coordinate is not yet a place, so the tap is still awaited.
    expect(screen.getByText(/図の上で基準点 1 の位置をタップしてください。/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('図上の Y（上端からのピクセル）'), { target: { value: '340' } });
    expect(screen.queryByText(/図の上で基準点 1 の位置をタップしてください。/)).toBeNull();
    const map = screen.getByRole('img', { name: '位置図' });
    map.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 400,
      height: 300,
      right: 400,
      bottom: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fireEvent.pointerDown(map, { clientX: 200, clientY: 150 });
    fireEvent.pointerUp(map, { clientX: 200, clientY: 150 });
    expect(useHunterMapStore.getState().points[0]).toMatchObject({ x: 120, y: 340 });
  });

  it('moves a point that is waiting for a tap', async () => {
    saved.image = savedImage;
    saved.setup = { imageId: 'map-1', points: [], model: 'affine', projection: 'transverse-mercator' };
    render(<HunterMapClient />);
    fireEvent.click(await loaded(() => screen.findByRole('button', { name: '基準点を追加' })));
    const map = screen.getByRole('img', { name: '位置図' });
    map.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 400,
      height: 300,
      right: 400,
      bottom: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fireEvent.pointerDown(map, { clientX: 200, clientY: 150 });
    fireEvent.pointerUp(map, { clientX: 200, clientY: 150 });
    // 400 × 300 on screen for a 4000 × 3000 picture: the middle is (2000, 1500).
    expect(useHunterMapStore.getState().points[0]).toMatchObject({ x: 2000, y: 1500 });
  });

  it('places a point by typing its pixels, for a keyboard', async () => {
    saved.image = savedImage;
    saved.setup = { imageId: 'map-1', points: [], model: 'affine', projection: 'transverse-mercator' };
    render(<HunterMapClient />);
    fireEvent.click(await loaded(() => screen.findByRole('button', { name: '基準点を追加' })));
    fireEvent.change(screen.getByLabelText('図上の X（左端からのピクセル）'), { target: { value: '120' } });
    fireEvent.change(screen.getByLabelText('図上の Y（上端からのピクセル）'), { target: { value: '340' } });
    expect(useHunterMapStore.getState().points[0]).toMatchObject({ x: 120, y: 340 });
    expect(screen.getByText('図の (120, 340)')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('図上の X（左端からのピクセル）'), { target: { value: '4001' } });
    expect(screen.getByText('0 から 4000 の数で入力してください。')).toBeInTheDocument();
    expect(screen.getByText('図の上の位置が図の外です。')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('図上の X（左端からのピクセル）'), { target: { value: '' } });
    expect(useHunterMapStore.getState().points[0]?.x).toBeNull();
  });

  it('deletes a saved picture that no longer decodes, and says so', async () => {
    vi.mocked(readImageSize).mockResolvedValueOnce(null);
    saved.image = savedImage;
    saved.setup = {
      imageId: 'map-1',
      points: [point('p1', 35.45, 138.45)],
      model: 'affine',
      projection: 'transverse-mercator',
    };
    render(<HunterMapClient />);
    // Once in the spoken region and once on the page.
    expect(await screen.findAllByText(discardedSaveMessage('ja'))).toHaveLength(2);
    expect(screen.getByText('位置図は読み込まれていません。')).toBeInTheDocument();
    await waitFor(() => expect(saved.image).toBeUndefined());
    expect(saved.setup).toMatchObject({ imageId: null, points: [] });
  });

  it('deletes a saved picture whose size no longer matches its points', async () => {
    vi.mocked(readImageSize).mockResolvedValueOnce({ width: 800, height: 600 });
    saved.image = savedImage;
    saved.setup = {
      imageId: 'map-1',
      points: [point('p1', 35.45, 138.45)],
      model: 'affine',
      projection: 'transverse-mercator',
    };
    render(<HunterMapClient />);
    // Once in the spoken region and once on the page.
    expect(await screen.findAllByText(discardedSaveMessage('ja'))).toHaveLength(2);
    await waitFor(() => expect(saved.image).toBeUndefined());
    expect(useHunterMapStore.getState().points).toEqual([]);
  });

  it('deletes a saved record that fails its schema, so the notice is not repeated', async () => {
    saved.image = { id: 'map-1', data: 'not bytes' };
    render(<HunterMapClient />);
    // Once in the spoken region and once on the page.
    expect(await screen.findAllByText(discardedSaveMessage('ja'))).toHaveLength(2);
    await waitFor(() => expect(saved.image).toBeUndefined());
  });

  it('says so when the saved picture fails to draw', async () => {
    saved.image = savedImage;
    saved.setup = { imageId: 'map-1', points: [], model: 'affine', projection: 'transverse-mercator' };
    const { container } = render(<HunterMapClient />);
    await loaded(() => screen.findByText(/「map.png」（/));
    fireEvent.error(container.querySelector('img')!);
    expect(
      screen.getByText('保存していた図を表示できませんでした。図の画像を選び直してください。'),
    ).toBeInTheDocument();
  });

  it('refuses a pole under Web Mercator beside the field and in the alignment', async () => {
    saved.image = savedImage;
    saved.setup = {
      imageId: 'map-1',
      points: [{ ...point('p1', 35.45, 138.45), latitude: '90' }, point('p2', 35.55, 138.56)],
      model: 'affine',
      projection: 'web-mercator',
    };
    render(<HunterMapClient />);
    expect(await loaded(() => screen.findByText('Web メルカトルでは緯度 ±90 度を扱えません。'))).toBeInTheDocument();
    expect(screen.getAllByLabelText('緯度（北緯）')[0]).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/Web メルカトルでは緯度 ±90 度（極）を扱えません/)).toBeInTheDocument();
  });
});
