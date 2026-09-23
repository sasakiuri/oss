import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  defaultImageSize,
  selectScale,
  storageKey,
  useShotPatternStore,
} from '@/app/(standalone)/labs/shot-pattern/_store';
import { ShotPatternClient } from '@/app/(standalone)/labs/shot-pattern/shot-pattern-client';
import { reportDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { PATTERN_DIAMETER_CM, toOffsetCm } from '@/lib/shot-pattern';

const key = storageKey;
const store = () => useShotPatternStore.getState();

/**
 * Waits for the tool and opens the closed sections a test is about to use, as a reader would:
 * a control inside a closed section is hidden, so it cannot be pressed until it is opened.
 */
const openSections = async (...titles: RegExp[]) => {
  for (const title of titles) {
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
    const heading = await waitFor(() => screen.getByRole('heading', { name: title }));
    const toggle = within(heading).getByRole('button');
    if (toggle.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle);
  }
};
const offsets = () => {
  const scale = selectScale(store())!;
  return store().shots.map((shot) => toOffsetCm(shot, store().centre, scale));
};

describe('shot pattern measurements', () => {
  beforeEach(() => {
    // Resetting the store persists it, so storage is emptied afterwards to start from a first visit.
    useShotPatternStore.setState(useShotPatternStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('starts on a blank board whose default scale spans the pattern circle', () => {
    expect(store().imageSize).toEqual(defaultImageSize);
    expect(selectScale(store())).toBeCloseTo(PATTERN_DIAMETER_CM / 600);
    expect(store().centre).toEqual({ x: 600, y: 450 });
  });
  it('adds, undoes, deletes and clears shots', () => {
    store().addShot({ x: 10, y: 20 });
    store().addShot({ x: 30, y: 40 });
    store().addShot({ x: Number.NaN, y: 0 });
    expect(store().shots).toHaveLength(2);
    store().undoShot();
    expect(store().shots).toMatchObject([{ x: 10, y: 20 }]);
    store().addShot({ x: 50, y: 60 });
    const [firstShot] = store().shots;
    if (!firstShot) throw new Error('Expected a shot.');
    store().removeShot(firstShot.id);
    expect(store().shots).toMatchObject([{ x: 50, y: 60 }]);
    store().clearShots();
    expect(store().shots).toEqual([]);
    store().undoShot();
    expect(store().shots).toEqual([]);
  });
  it('puts a whole reading in place of the shots, dropping any coordinate that is not a number', () => {
    store().addShot({ x: 1, y: 2 });
    store().replaceShots([
      { x: 10, y: 20 },
      { x: Number.NaN, y: 30 },
      { x: 40, y: Infinity },
      { x: 50, y: 60 },
    ]);
    expect(store().shots.map((shot) => [shot.x, shot.y])).toEqual([
      [10, 20],
      [50, 60],
    ]);
    expect(new Set(store().shots.map((shot) => shot.id)).size).toBe(2);
    store().replaceShots([]);
    expect(store().shots).toEqual([]);
  });
  it('offers the automatic reading only once a photo has been read', async () => {
    render(createElement(ShotPatternClient));
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
    expect(screen.getByRole('button', { name: '写真から自動で検出' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'カメラで撮影する' })).toBeEnabled();
    expect(screen.getByText(/写真・実寸の基準・円の直径・粒の直径が必要です/)).toBeInTheDocument();
  });
  it('says how faint a mark has to be, and follows the sensitivity', async () => {
    render(createElement(ShotPatternClient));
    const slider = await screen.findByLabelText('検出の感度');
    expect(screen.getByText(/明るさで 50 段階以上暗い痕を拾います/)).toBeInTheDocument();
    fireEvent.change(slider, { target: { value: '1' } });
    expect(screen.getByText(/明るさで 10 段階以上暗い痕を拾います/)).toBeInTheDocument();
  });
  it('records a shot from centimetre coordinates without a pointer', () => {
    expect(store().addShotAtOffset({ x: 38.1, y: 0 })).toBe(true);
    expect(store().shots).toHaveLength(1);
    expect(store().shots[0]).toMatchObject({ x: 900, y: 450 });
    expect(offsets()[0]!.x).toBeCloseTo(38.1);
    expect(store().addShotAtOffset({ x: Number.NaN, y: 0 })).toBe(false);
    store().setReferenceCm(Number.NaN);
    expect(store().addShotAtOffset({ x: 1, y: 1 })).toBe(false);
    expect(store().shots).toHaveLength(1);
  });
  it('places the reference points from coordinates', () => {
    store().setCalibrationPoint('a', { x: 300, y: 150 });
    store().setCalibrationPoint('b', { x: 700, y: 450 });
    expect(selectScale(store())).toBeCloseTo(PATTERN_DIAMETER_CM / 500);
    store().setCalibrationPoint('b', { x: 300, y: 150 });
    expect(selectScale(store())).toBeNull();
    store().setCalibrationPoint('b', { x: Number.NaN, y: 150 });
    expect(selectScale(store())).toBeNull();
  });
  it('rebuilds the frame for a new photo and drops the previous shots', () => {
    store().setReferenceCm(50);
    store().addShot({ x: 10, y: 20 });
    store().setImage({ width: 800, height: 600 });
    expect(store()).toMatchObject({
      imageSize: { width: 800, height: 600 },
      centre: { x: 400, y: 300 },
      calibration: { a: { x: 200, y: 300 }, b: { x: 600, y: 300 }, referenceCm: 50 },
      shots: [],
    });
    store().setImage(null);
    expect(store()).toMatchObject({ imageSize: defaultImageSize, centre: { x: 600, y: 450 } });
  });
  it('saves a measurement as centimetres and restores it later', () => {
    store().addShotAtOffset({ x: 10, y: -20 });
    store().addShotAtOffset({ x: 60, y: 0 });
    store().setPellets(250);
    store().setNote('35 m / full');
    store().setDiameterCm(70);
    expect(store().saveRecord(' 35 m ')).toBe(true);
    const record = store().records[0];
    if (!record) throw new Error('Expected a saved record.');
    expect(record).toMatchObject({ name: '35 m', pellets: 250, note: '35 m / full', diameterCm: 70 });
    const [firstSavedShot] = record.shots;
    if (!firstSavedShot) throw new Error('Expected a saved shot.');
    expect(firstSavedShot.x).toBeCloseTo(10);
    expect(firstSavedShot.y).toBeCloseTo(-20);
    expect(Date.parse(record.savedAt)).not.toBeNaN();

    store().clearShots();
    store().setPellets(null);
    store().setNote('');
    store().setDiameterCm(PATTERN_DIAMETER_CM);
    expect(store().loadRecord(record.id)).toBe(true);
    expect(store()).toMatchObject({ pellets: 250, note: '35 m / full', diameterCm: 70 });
    const [firstLoadedOffset, secondLoadedOffset] = offsets();
    if (!firstLoadedOffset || !secondLoadedOffset) throw new Error('Expected two measured offsets.');
    expect(firstLoadedOffset.x).toBeCloseTo(10);
    expect(secondLoadedOffset.x).toBeCloseTo(60);
    expect(store().loadRecord('missing')).toBe(false);

    store().deleteRecord(record.id);
    expect(store().records).toEqual([]);
  });
  it('restores a deleted measurement at its place, under a free name', () => {
    store().saveRecord('A');
    store().saveRecord('B');
    const [first, second] = store().records;
    if (!first || !second) throw new Error('Expected two saved records.');
    store().deleteRecord(first.id);
    expect(store().records).toEqual([second]);
    expect(store().deletedRecord).toMatchObject({ index: 0, record: { name: 'A' } });
    store().undoDelete();
    expect(store().records.map((record) => record.name)).toEqual(['A', 'B']);
    expect(store().deletedRecord).toBeNull();

    store().deleteRecord(second.id);
    store().saveRecord('B');
    store().undoDelete();
    // The name was taken while the record was gone, so the restored one is kept apart from it.
    expect(store().records.map((record) => record.name)).toEqual(['A', 'B (2)', 'B']);
    store().undoDelete();
    expect(store().records).toHaveLength(3);
  });
  it('refuses a measurement without a name, with a duplicate name or without a scale', () => {
    expect(store().saveRecord('   ')).toBe(false);
    expect(store().saveRecord('A')).toBe(true);
    expect(store().saveRecord('A')).toBe(false);
    store().setReferenceCm(0);
    expect(store().saveRecord('B')).toBe(false);
    store().setReferenceCm(PATTERN_DIAMETER_CM);
    store().setDiameterCm(Number.NaN);
    expect(store().saveRecord('C')).toBe(false);
    expect(store().records).toHaveLength(1);
  });
  it('keeps the photo and its pixel frame out of storage', async () => {
    store().setImage({ width: 800, height: 600 });
    store().setReferenceCm(60);
    store().addShotAtOffset({ x: 5, y: 5 });
    store().setDiameterCm(70);
    store().saveRecord('Pattern');
    const saved = JSON.parse(window.localStorage.getItem(key)!);
    expect(Object.keys(saved.state).sort()).toEqual(['diameterCm', 'records', 'referenceCm']);
    expect(saved.state.records[0].shots[0].x).toBeCloseTo(5);

    useShotPatternStore.setState(useShotPatternStore.getInitialState(), true);
    window.localStorage.setItem(key, JSON.stringify(saved));
    await useShotPatternStore.persist.rehydrate();
    expect(store()).toMatchObject({
      diameterCm: 70,
      imageSize: defaultImageSize,
      shots: [],
      calibration: { referenceCm: 60 },
      records: [{ name: 'Pattern' }],
    });
  });
  it('restores the last usable length when a field is left blank', async () => {
    store().setDiameterCm(70);
    store().setReferenceCm(50);
    store().setDiameterCm(Number.NaN);
    store().setReferenceCm(Number.NaN);
    expect(selectScale(store())).toBeNull();
    const saved = window.localStorage.getItem(key)!;
    useShotPatternStore.setState(useShotPatternStore.getInitialState(), true);
    window.localStorage.setItem(key, saved);
    await useShotPatternStore.persist.rehydrate();
    expect(store()).toMatchObject({ diameterCm: 70, calibration: { referenceCm: 50 } });
  });
  it('falls back to the default length when nothing usable was ever entered', async () => {
    store().setDiameterCm(Number.NaN);
    store().setReferenceCm(Number.NaN);
    await useShotPatternStore.persist.rehydrate();
    expect(store()).toMatchObject({
      diameterCm: PATTERN_DIAMETER_CM,
      calibration: { referenceCm: PATTERN_DIAMETER_CM },
    });
  });
  it('says when saved data could not be read instead of starting over in silence', async () => {
    window.localStorage.setItem(key, JSON.stringify({ state: { language: 'fr' }, version: 0 }));
    await useShotPatternStore.persist.rehydrate();
    expect(useStorageStatus.getState().discarded).toEqual([key]);
    expect(store().diameterCm).toBe(PATTERN_DIAMETER_CM);
  });
  it('keeps quiet on a first visit, when nothing has been saved yet', async () => {
    // zustand calls merge with undefined when storage is empty, which is not a save that failed to load.
    expect(window.localStorage.getItem(key)).toBeNull();
    await useShotPatternStore.persist.rehydrate();
    expect(useStorageStatus.getState().discarded).toEqual([]);
  });
  it('keeps quiet when the saved data is usable', async () => {
    store().setDiameterCm(70);
    await useShotPatternStore.persist.rehydrate();
    expect(useStorageStatus.getState().discarded).toEqual([]);
    expect(store().diameterCm).toBe(70);
  });
  it('has its live region on the page before the saved measurements are read', () => {
    const { container } = render(createElement(ShotPatternClient));
    // Still loading: the tool is rendered but held busy, and the region has to be here already, and
    // empty, or nothing it says is announced.
    expect(container.querySelector('[aria-busy="true"]')).toContainElement(
      screen.getByRole('heading', { name: '1. 写真を読み込む' }),
    );
    const regions = screen.getAllByRole('status');
    expect(regions.some((region) => region.className.includes('sr-only') && region.textContent === '')).toBe(true);
  });
  it('does not claim a photo is loaded before it has been read', async () => {
    render(createElement(ShotPatternClient));
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
    const status = screen.getAllByRole('status').find((node) => node.textContent === '写真なし');
    expect(status).toBeDefined();
    // jsdom never decodes an image, so the page stays in the state between choosing a file and reading it.
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} });
    fireEvent.change(screen.getByLabelText('写真を選ぶ'), {
      target: { files: [new File(['x'], 'board.png', { type: 'image/png' })] },
    });
    expect(status).toHaveTextContent('写真を読み込み中…');
    expect(status?.textContent).not.toContain('1200 × 900');
  });
  it('clears the photo when the header reset is used, not only the store', async () => {
    render(createElement(ShotPatternClient));
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
    const status = screen.getAllByRole('status').find((node) => node.textContent === '写真なし');
    expect(status).toBeDefined();
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} });
    fireEvent.change(screen.getByLabelText('写真を選ぶ'), {
      target: { files: [new File(['x'], 'target.png', { type: 'image/png' })] },
    });
    expect(status).toHaveTextContent('写真を読み込み中…');

    fireEvent.click(screen.getByRole('button', { name: '入力を初期値に戻す' }));
    fireEvent.click(await screen.findByRole('button', { name: '初期値に戻す' }));

    // The photo is component state, not store state. Resetting the store alone would leave it on
    // screen while the frame it is drawn into went back to its default size, which silently
    // stretches the picture and every measurement taken from it afterwards.
    await waitFor(() => expect(status).toHaveTextContent('写真なし'));
    expect(useShotPatternStore.getState().imageSize).toEqual(defaultImageSize);
  });
  it('has its message regions on the page before the first message', async () => {
    render(createElement(ShotPatternClient));
    await openSections(/^6\. 記録を保存/, /^座標で追加・打点の一覧/);
    const regions = () => screen.getAllByRole('status');
    const before = regions().length;
    expect(regions().filter((region) => region.textContent === '').length).toBeGreaterThanOrEqual(3);

    fireEvent.change(screen.getByLabelText(/中心からの左右/), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/中心からの上下/), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /この座標で追加/ }));
    fireEvent.change(screen.getByLabelText(/記録名/), { target: { value: '初回' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByText('保存しました。')).toBeInTheDocument();
    expect(screen.getByText(/打点を追加しました。/)).toBeInTheDocument();
    // No region was inserted to carry them, so the first message of each is announced like the rest.
    expect(regions()).toHaveLength(before);
  });
  it('carries a deletion and its undo in the regions that were already there', async () => {
    render(createElement(ShotPatternClient));
    await openSections(/^6\. 記録を保存/);
    fireEvent.change(screen.getByLabelText(/記録名/), { target: { value: '初回' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    const before = screen.getAllByRole('status');
    const sameNodes = () => {
      const now = screen.getAllByRole('status');
      expect(now).toHaveLength(before.length);
      now.forEach((region, index) => expect(region).toBe(before[index]));
    };

    fireEvent.click(screen.getByRole('button', { name: '「初回」を削除' }));
    expect(screen.getByText('「初回」を削除しました。')).toBeInTheDocument();
    sameNodes();
    fireEvent.click(screen.getByRole('button', { name: '元に戻す' }));
    expect(screen.getByText('元に戻しました。')).toBeInTheDocument();
    sameNodes();

    // Saving while a deletion is still undoable must not hide either of them.
    fireEvent.click(screen.getByRole('button', { name: '「初回」を削除' }));
    fireEvent.change(screen.getByLabelText(/記録名/), { target: { value: '二回目' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByText('「初回」を削除しました。')).toBeInTheDocument();
    // An element of its own, so the gap below the banner is kept.
    expect(screen.getByText('保存しました。').tagName).toBe('P');
    sameNodes();
  });
  it('says whether undoing a deletion reached storage', async () => {
    render(createElement(ShotPatternClient));
    await openSections(/^6\. 記録を保存/);
    fireEvent.change(screen.getByLabelText(/記録名/), { target: { value: '初回' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByText('保存しました。')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '「初回」を削除' }));
    fireEvent.click(screen.getByRole('button', { name: '元に戻す' }));
    expect(screen.getByText('元に戻しました。')).toBeInTheDocument();

    // Restoring grows the payload again, which is exactly when a full device rejects the write.
    vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    fireEvent.click(screen.getByRole('button', { name: '「初回」を削除' }));
    fireEvent.click(screen.getByRole('button', { name: '元に戻す' }));
    expect(screen.getByRole('button', { name: '呼び出す' })).toBeInTheDocument();
    expect(screen.getByText('端末に保存できませんでした。')).toBeInTheDocument();
  });
  it('stays quiet about saved data that belongs to another tool', async () => {
    // Labs moves between tools without a reload, so one tool's failure must not speak for another's.
    reportDiscardedSave('nilay-labs-hunting-hours-v1');
    render(createElement(ShotPatternClient));
    await openSections(/^6\. 記録を保存/);
    const notice = '保存されていた設定を読み取れなかったため、初期値で開いています。';
    expect(screen.queryAllByText(notice)).toHaveLength(0);
    act(() => reportDiscardedSave(key));
    // Twice at once: the visible line, and the region that speaks it.
    expect(screen.getAllByText(notice)).toHaveLength(2);

    // The notice has a region of its own rather than riding on the debounced summary, which is
    // atomic and would read the notice out again on every change. A summary that has something to
    // say is what tells the two shapes apart: concatenated, neither region would hold the notice
    // on its own once a result exists.
    act(() => {
      useShotPatternStore.getState().addShotAtOffset({ x: 0, y: 0 });
    });
    await waitFor(() => expect(screen.getAllByText(notice)).toHaveLength(2), { timeout: 2000 });
    // The spoken summary, not the label of the figure that shows the same count.
    await waitFor(() => expect(screen.getByText(/円内の着弾 \d+ 点/)).toBeInTheDocument(), { timeout: 2000 });
  });
  it('ignores saved data that is not a valid set of measurements', async () => {
    for (const state of [
      // The language these saves still name is no longer part of a measurement; what makes them
      // unreadable is the measurement itself.
      { language: 'ja', referenceCm: 0, diameterCm: 76.2, records: [] },
      { language: 'ja', referenceCm: 76.2, diameterCm: 76.2, records: [{ id: 'x', name: '', shots: [] }] },
    ]) {
      useShotPatternStore.setState(useShotPatternStore.getInitialState(), true);
      window.localStorage.setItem(key, JSON.stringify({ state, version: 0 }));
      await useShotPatternStore.persist.rehydrate();
      expect(store()).toMatchObject({ diameterCm: PATTERN_DIAMETER_CM, records: [] });
    }
  });
  it('starts a new measurement while keeping the saved records', () => {
    store().saveRecord('Pattern');
    store().setImage({ width: 800, height: 600 });
    store().addShot({ x: 10, y: 10 });
    store().setNote('draft');
    store().reset();
    expect(store()).toMatchObject({
      note: '',
      shots: [],
      imageSize: defaultImageSize,
      records: [{ name: 'Pattern' }],
    });
  });
});
