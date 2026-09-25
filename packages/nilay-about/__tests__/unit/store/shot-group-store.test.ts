import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  defaultImageSize,
  defaultReferenceMm,
  selectBulletDiameterMm,
  selectScale,
  storageKey,
  useShotGroupStore,
} from '@/app/(standalone)/labs/shot-group/_store';
import { ShotGroupClient } from '@/app/(standalone)/labs/shot-group/shot-group-client';
import { reportDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { toImpactMm } from '@/lib/shot-group';

const key = storageKey;
const store = () => useShotGroupStore.getState();

/**
 * Waits for the tool and opens the closed sections a test is about to use, as a reader would:
 * a control inside a closed section is hidden, so it cannot be pressed until it is opened.
 */
const openSections = async (...titles: RegExp[]) => {
  for (const title of titles) {
    const heading = await waitFor(() => screen.getByRole('heading', { name: title }));
    const toggle = within(heading).getByRole('button');
    if (toggle.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle);
  }
};
const measured = () => {
  const scale = selectScale(store())!;
  return store().impacts.map((impact) => toImpactMm(impact, store().aim, scale));
};

describe('shot group measurements', () => {
  beforeEach(() => {
    // Resetting the store persists it, so storage is emptied afterwards to start from a first visit.
    useShotGroupStore.setState(useShotGroupStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('starts on a blank target whose default scale spans the reference length', () => {
    expect(store().imageSize).toEqual(defaultImageSize);
    expect(selectScale(store())).toBeCloseTo(defaultReferenceMm / 600);
    expect(store().aim).toEqual({ x: 600, y: 450 });
    expect(store().distance).toEqual({ value: 100, unit: 'm' });
    expect(selectBulletDiameterMm(store())).toBeNull();
  });
  it('adds, undoes, deletes and clears impacts', () => {
    store().addImpact({ x: 10, y: 20 });
    store().addImpact({ x: 30, y: 40 });
    store().addImpact({ x: Number.NaN, y: 0 });
    expect(store().impacts).toHaveLength(2);
    store().undoImpact();
    expect(store().impacts).toMatchObject([{ x: 10, y: 20 }]);
    store().addImpact({ x: 50, y: 60 });
    const [firstImpact] = store().impacts;
    if (!firstImpact) throw new Error('Expected an impact.');
    store().removeImpact(firstImpact.id);
    expect(store().impacts).toMatchObject([{ x: 50, y: 60 }]);
    store().clearImpacts();
    expect(store().impacts).toEqual([]);
    store().undoImpact();
    expect(store().impacts).toEqual([]);
  });
  it('puts a whole reading in place of the impacts, dropping any coordinate that is not a number', () => {
    store().addImpact({ x: 1, y: 2 });
    store().replaceImpacts([
      { x: 10, y: 20 },
      { x: Number.NaN, y: 30 },
      { x: 40, y: Infinity },
      { x: 50, y: 60 },
    ]);
    expect(store().impacts.map((impact) => [impact.x, impact.y])).toEqual([
      [10, 20],
      [50, 60],
    ]);
    expect(new Set(store().impacts.map((impact) => impact.id)).size).toBe(2);
    store().replaceImpacts([]);
    expect(store().impacts).toEqual([]);
  });
  it('offers the automatic reading only once a photo and a bullet diameter are there', async () => {
    render(createElement(ShotGroupClient));
    await waitFor(() => screen.getByRole('button', { name: '写真から自動で検出' }));
    expect(screen.getByRole('button', { name: '写真から自動で検出' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'カメラで撮影する' })).toBeEnabled();
    expect(screen.getByText(/実寸の基準（手順 2）・弾径（手順 3）が必要です/)).toBeInTheDocument();
  });
  it('says how faint a mark has to be, and follows the sensitivity', async () => {
    render(createElement(ShotGroupClient));
    const slider = await screen.findByLabelText('検出の感度');
    // Said twice: in the line that stands for the closed section, and beside the slider itself.
    expect(screen.getAllByText(/明るさの差が 50 段階以上/)).toHaveLength(2);
    fireEvent.change(slider, { target: { value: '0' } });
    expect(screen.getAllByText(/明るさの差が 90 段階以上/)).toHaveLength(2);
  });
  it('records an impact from millimetre coordinates without a pointer', () => {
    expect(store().addImpactAtOffset({ x: 50, y: 0 })).toBe(true);
    expect(store().impacts).toHaveLength(1);
    expect(store().impacts[0]).toMatchObject({ x: 900, y: 450 });
    expect(measured()[0]!.x).toBeCloseTo(50);
    expect(store().addImpactAtOffset({ x: Number.NaN, y: 0 })).toBe(false);
    store().setReferenceValue(Number.NaN);
    expect(store().addImpactAtOffset({ x: 1, y: 1 })).toBe(false);
    expect(store().impacts).toHaveLength(1);
  });
  it('places the reference points from coordinates', () => {
    store().setCalibrationPoint('a', { x: 300, y: 150 });
    store().setCalibrationPoint('b', { x: 700, y: 450 });
    expect(selectScale(store())).toBeCloseTo(defaultReferenceMm / 500);
    store().setCalibrationPoint('b', { x: 300, y: 150 });
    expect(selectScale(store())).toBeNull();
    store().setCalibrationPoint('b', { x: Number.NaN, y: 150 });
    expect(selectScale(store())).toBeNull();
  });
  it('keeps the measured reference at the same real length when its unit changes', () => {
    const scale = selectScale(store());
    store().setReferenceUnit('cm');
    expect(store().calibration).toMatchObject({ value: 10, unit: 'cm' });
    expect(selectScale(store())).toBeCloseTo(scale!, 10);
    store().setReferenceUnit('inch');
    expect(store().calibration.value).toBeCloseTo(3.937, 3);
    expect(selectScale(store())).toBeCloseTo(scale!, 4);
    // A blank field has no length to carry over, so the unit changes on its own.
    store().setReferenceValue(Number.NaN);
    store().setReferenceUnit('mm');
    expect(store().calibration.unit).toBe('mm');
    expect(selectScale(store())).toBeNull();
  });
  it('keeps the shooting distance at the number that was typed when its unit changes', () => {
    // 100 m and 100 yd are both range settings, so the figure stays and is read in the new unit.
    store().setDistance({ value: 100, unit: 'yd' });
    expect(store().distance).toEqual({ value: 100, unit: 'yd' });
    store().setDistance({ value: Number.NaN, unit: 'yd' });
    expect(store().lastValidDistanceValue).toBe(100);
  });
  it('keeps the bullet diameter at the same real length when its unit changes', () => {
    store().setBulletDiameter(7.82);
    expect(selectBulletDiameterMm(store())).toBeCloseTo(7.82, 10);
    store().setBulletUnit('inch');
    // .308 inch is the calibre this diameter is sold under.
    expect(store().bulletDiameter.value).toBeCloseTo(0.3079, 4);
    expect(selectBulletDiameterMm(store())).toBeCloseTo(7.82, 2);
    store().setBulletDiameter(null);
    store().setBulletUnit('mm');
    expect(store().bulletDiameter).toEqual({ value: null, unit: 'mm' });
    expect(selectBulletDiameterMm(store())).toBeNull();
  });
  it('keeps a half-typed bullet diameter out of the save, so the saved groups survive it', async () => {
    store().saveRecord('A');
    store().setBulletDiameter(7.82);
    // A zero and a minus sign are what a reader passes through on the way to a number. Saving either
    // would fail the schema on the next visit and take every saved group with it.
    for (const draft of [0, -5, Number.NaN]) {
      store().setBulletDiameter(draft);
      expect(store().bulletDiameter.value).toBe(Number.isNaN(draft) ? Number.NaN : draft);
      const saved = window.localStorage.getItem(key)!;
      expect(JSON.parse(saved).state.bulletDiameter).toEqual({ value: 7.82, unit: 'mm' });
      useShotGroupStore.setState(useShotGroupStore.getInitialState(), true);
      window.localStorage.setItem(key, saved);
      await useShotGroupStore.persist.rehydrate();
      expect(store().records).toHaveLength(1);
      expect(store().bulletDiameter.value).toBe(7.82);
      expect(useStorageStatus.getState().discarded).not.toContain(key);
      store().setBulletDiameter(7.82);
    }
    // A field the reader clears is a diameter withheld, not a draft, so that does reach the save.
    store().setBulletDiameter(null);
    expect(JSON.parse(window.localStorage.getItem(key)!).state.bulletDiameter).toEqual({ value: null, unit: 'mm' });
  });
  it('rebuilds the frame for a new photo and drops the previous impacts', () => {
    store().setReferenceValue(50);
    store().addImpact({ x: 10, y: 20 });
    store().setImage({ width: 800, height: 600 });
    expect(store()).toMatchObject({
      imageSize: { width: 800, height: 600 },
      aim: { x: 400, y: 300 },
      calibration: { a: { x: 200, y: 450 }, b: { x: 600, y: 450 }, value: 50, unit: 'mm' },
      impacts: [],
    });
    store().setImage(null);
    expect(store()).toMatchObject({ imageSize: defaultImageSize, aim: { x: 600, y: 450 } });
  });
  it('saves a group in millimetres and restores it later', () => {
    store().addImpactAtOffset({ x: 10, y: -20 });
    store().addImpactAtOffset({ x: 30, y: 0 });
    store().setBulletDiameter(7.82);
    store().setDistance({ value: 50, unit: 'm' });
    store().setNote('308Win / 150gr');
    expect(store().saveRecord(' 50 m ')).toBe(true);
    const record = store().records[0];
    if (!record) throw new Error('Expected a saved record.');
    expect(record).toMatchObject({ name: '50 m', note: '308Win / 150gr', distance: { value: 50, unit: 'm' } });
    expect(record.bulletDiameterMm).toBeCloseTo(7.82, 10);
    const [firstSavedImpact, secondSavedImpact] = record.impacts;
    if (!firstSavedImpact || !secondSavedImpact) throw new Error('Expected two saved impacts.');
    expect(firstSavedImpact.x).toBeCloseTo(10);
    expect(firstSavedImpact.y).toBeCloseTo(-20);
    expect(Date.parse(record.savedAt)).not.toBeNaN();

    store().clearImpacts();
    store().setBulletDiameter(null);
    store().setDistance({ value: 100, unit: 'm' });
    store().setNote('');
    expect(store().loadRecord(record.id)).toBe(true);
    expect(store()).toMatchObject({ note: '308Win / 150gr', distance: { value: 50, unit: 'm' } });
    expect(store().bulletDiameter.value).toBeCloseTo(7.82, 4);
    const [firstLoadedImpact, secondLoadedImpact] = measured();
    if (!firstLoadedImpact || !secondLoadedImpact) throw new Error('Expected two measured impacts.');
    expect(firstLoadedImpact.x).toBeCloseTo(10);
    expect(secondLoadedImpact.x).toBeCloseTo(30);
    expect(store().loadRecord('missing')).toBe(false);

    store().deleteRecord(record.id);
    expect(store().records).toEqual([]);
  });
  it('reads a saved bullet diameter back in the unit the field is showing', () => {
    store().setBulletDiameter(7.82);
    store().saveRecord('mm');
    store().setBulletUnit('inch');
    const [savedRecord] = store().records;
    if (!savedRecord) throw new Error('Expected a saved record.');
    expect(store().loadRecord(savedRecord.id)).toBe(true);
    expect(store().bulletDiameter).toMatchObject({ unit: 'inch' });
    expect(store().bulletDiameter.value).toBeCloseTo(0.3079, 4);
  });
  it('restores a deleted group at its place, under a free name', () => {
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
  it('refuses a group without a name, with a duplicate name or without a usable setup', () => {
    expect(store().saveRecord('   ')).toBe(false);
    expect(store().saveRecord('A')).toBe(true);
    expect(store().saveRecord('A')).toBe(false);
    store().setReferenceValue(0);
    expect(store().saveRecord('B')).toBe(false);
    store().setReferenceValue(defaultReferenceMm);
    store().setDistance({ value: Number.NaN, unit: 'm' });
    expect(store().saveRecord('C')).toBe(false);
    store().setDistance({ value: 100, unit: 'm' });
    store().setBulletDiameter(-1);
    // An unusable diameter is the same as none at all, so it never blocks the measurement itself.
    expect(store().saveRecord('D')).toBe(true);
    expect(store().records.at(-1)!.bulletDiameterMm).toBeNull();
  });
  it('keeps the photo and its pixel frame out of storage', async () => {
    store().setImage({ width: 800, height: 600 });
    store().setReferenceValue(60);
    store().addImpactAtOffset({ x: 5, y: 5 });
    store().setDistance({ value: 50, unit: 'yd' });
    store().setOffsetUnit('inch');
    store().saveRecord('Group');
    const saved = JSON.parse(window.localStorage.getItem(key)!);
    expect(Object.keys(saved.state).sort()).toEqual([
      'bulletDiameter',
      'distance',
      'offsetUnit',
      'records',
      'reference',
      // How the scale is set and the printed mark spacing: part of the setup, not of the photo.
      'sheet',
      'targetPrecision',
    ]);
    expect(saved.state.records[0].impacts[0].x).toBeCloseTo(5);

    useShotGroupStore.setState(useShotGroupStore.getInitialState(), true);
    window.localStorage.setItem(key, JSON.stringify(saved));
    await useShotGroupStore.persist.rehydrate();
    expect(store()).toMatchObject({
      offsetUnit: 'inch',
      imageSize: defaultImageSize,
      impacts: [],
      calibration: { value: 60, unit: 'mm' },
      distance: { value: 50, unit: 'yd' },
      records: [{ name: 'Group' }],
    });
  });
  it('keeps the precision target, and reads a save written before it existed', async () => {
    store().setTargetPrecision(0.5);
    store().setTargetPrecisionUnit('moa');
    // The target is a goal rather than a measured length, so the number stays as it was typed.
    expect(store().targetPrecision).toEqual({ value: 0.5, unit: 'moa' });
    const saved = JSON.parse(window.localStorage.getItem(key)!);
    expect(saved.state.targetPrecision).toEqual({ value: 0.5, unit: 'moa' });

    useShotGroupStore.setState(useShotGroupStore.getInitialState(), true);
    window.localStorage.setItem(key, JSON.stringify(saved));
    await useShotGroupStore.persist.rehydrate();
    expect(store().targetPrecision).toEqual({ value: 0.5, unit: 'moa' });

    // A save from before the statistics were added carries no target at all. It has to load - with
    // every group in it - and simply leave the field at its default.
    const older = JSON.parse(JSON.stringify(saved));
    delete older.state.targetPrecision;
    older.state.records = saved.state.records;
    useShotGroupStore.setState(useShotGroupStore.getInitialState(), true);
    window.localStorage.setItem(key, JSON.stringify(older));
    await useShotGroupStore.persist.rehydrate();
    expect(store().targetPrecision).toEqual({ value: 10, unit: 'mm' });
    expect(useStorageStatus.getState().discarded).toEqual([]);
  });
  it('keeps a cleared precision target cleared, and a draft out of storage', async () => {
    store().setTargetPrecision(null);
    expect(store().targetPrecision.value).toBeNull();
    store().setTargetPrecision(Number.NaN);
    // A draft on the way to a number is not stored, while a field cleared on purpose is.
    expect(JSON.parse(window.localStorage.getItem(key)!).state.targetPrecision.value).toBeNull();
    const saved = window.localStorage.getItem(key)!;
    useShotGroupStore.setState(useShotGroupStore.getInitialState(), true);
    window.localStorage.setItem(key, saved);
    await useShotGroupStore.persist.rehydrate();
    expect(store().targetPrecision.value).toBeNull();
  });
  it('restores the last usable length when a field is left blank', async () => {
    store().setReferenceValue(50);
    store().setDistance({ value: 200, unit: 'm' });
    store().setReferenceValue(Number.NaN);
    store().setDistance({ value: Number.NaN, unit: 'm' });
    expect(selectScale(store())).toBeNull();
    const saved = window.localStorage.getItem(key)!;
    useShotGroupStore.setState(useShotGroupStore.getInitialState(), true);
    window.localStorage.setItem(key, saved);
    await useShotGroupStore.persist.rehydrate();
    expect(store()).toMatchObject({ calibration: { value: 50 }, distance: { value: 200 } });
  });
  it('falls back to the default length when nothing usable was ever entered', async () => {
    store().setReferenceValue(Number.NaN);
    store().setDistance({ value: Number.NaN, unit: 'm' });
    await useShotGroupStore.persist.rehydrate();
    expect(store()).toMatchObject({ calibration: { value: defaultReferenceMm }, distance: { value: 100 } });
  });
  it('says when saved data could not be read instead of starting over in silence', async () => {
    window.localStorage.setItem(key, JSON.stringify({ state: { language: 'fr' }, version: 0 }));
    await useShotGroupStore.persist.rehydrate();
    expect(useStorageStatus.getState().discarded).toEqual([key]);
    expect(store().calibration.value).toBe(defaultReferenceMm);
  });
  it('keeps quiet on a first visit, when nothing has been saved yet', async () => {
    // zustand calls merge with undefined when storage is empty, which is not a save that failed to load.
    expect(window.localStorage.getItem(key)).toBeNull();
    await useShotGroupStore.persist.rehydrate();
    expect(useStorageStatus.getState().discarded).toEqual([]);
  });
  it('ignores saved data that is not a valid setup', async () => {
    const valid = {
      // The language is no longer part of a measurement, and a save that still names it is read.
      language: 'ja',
      reference: { value: 100, unit: 'mm' },
      distance: { value: 100, unit: 'm' },
      offsetUnit: 'mm',
      bulletDiameter: { value: null, unit: 'mm' },
      records: [],
    };
    for (const state of [
      { ...valid, reference: { value: 0, unit: 'mm' } },
      { ...valid, distance: { value: 100, unit: 'ft' } },
      { ...valid, bulletDiameter: { value: 0, unit: 'mm' } },
      { ...valid, records: [{ id: 'x', name: '', impacts: [] }] },
    ]) {
      useShotGroupStore.setState(useShotGroupStore.getInitialState(), true);
      window.localStorage.setItem(key, JSON.stringify({ state, version: 0 }));
      await useShotGroupStore.persist.rehydrate();
      expect(store()).toMatchObject({ calibration: { value: defaultReferenceMm }, records: [] });
    }
  });
  it('starts a new measurement while keeping the saved groups', () => {
    store().saveRecord('Group');
    store().setImage({ width: 800, height: 600 });
    store().addImpact({ x: 10, y: 10 });
    store().setNote('draft');
    store().reset();
    expect(store()).toMatchObject({
      note: '',
      impacts: [],
      imageSize: defaultImageSize,
      records: [{ name: 'Group' }],
    });
  });
  it('has its live region on the page before the saved groups are read', () => {
    const { container } = render(createElement(ShotGroupClient));
    // Still loading: the region has to be here already, and empty, or nothing it says is announced.
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    const regions = screen.getAllByRole('status');
    expect(regions.some((region) => region.className.includes('sr-only') && region.textContent === '')).toBe(true);
  });
  it('does not claim a photo is loaded before it has been read', async () => {
    render(createElement(ShotGroupClient));
    await waitFor(() => screen.getByRole('heading', { name: '1. 写真を読み込む' }));
    const status = screen.getAllByRole('status').find((node) => node.textContent === '写真なし');
    expect(status).toBeDefined();
    // jsdom never decodes an image, so the page stays in the state between choosing a file and reading it.
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} });
    fireEvent.change(screen.getByLabelText('写真を選ぶ'), {
      target: { files: [new File(['x'], 'target.png', { type: 'image/png' })] },
    });
    expect(status).toHaveTextContent('写真を読み込み中…');
    expect(status?.textContent).not.toContain('1200 × 900');
  });
  it('clears the photo when the header reset is used, not only the store', async () => {
    render(createElement(ShotGroupClient));
    await waitFor(() => screen.getByRole('heading', { name: '1. 写真を読み込む' }));
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
    expect(useShotGroupStore.getState().imageSize).toEqual(defaultImageSize);
  });
  it('has its message regions on the page before the first message', async () => {
    render(createElement(ShotGroupClient));
    await openSections(/^7\. 記録を保存/, /^座標で追加・着弾の一覧/);
    const regions = () => screen.getAllByRole('status');
    const before = regions().length;
    expect(regions().filter((region) => region.textContent === '').length).toBeGreaterThanOrEqual(3);

    fireEvent.change(screen.getByLabelText(/狙点からの左右/), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/狙点からの上下/), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /この座標で追加/ }));
    fireEvent.change(screen.getByLabelText('記録名'), { target: { value: '初回' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByText('保存しました。')).toBeInTheDocument();
    expect(screen.getByText(/着弾を追加しました。/)).toBeInTheDocument();
    // No region was inserted to carry them, so the first message of each is announced like the rest.
    expect(regions()).toHaveLength(before);
  });
  it('carries a deletion and its undo in the regions that were already there', async () => {
    render(createElement(ShotGroupClient));
    await openSections(/^7\. 記録を保存/);
    fireEvent.change(screen.getByLabelText('記録名'), { target: { value: '初回' } });
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
  });
  it('says when a group could not reach storage', async () => {
    render(createElement(ShotGroupClient));
    await openSections(/^7\. 記録を保存/);
    vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    fireEvent.change(screen.getByLabelText('記録名'), { target: { value: '初回' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByRole('button', { name: '呼び出す' })).toBeInTheDocument();
    expect(screen.getByText('端末に保存できませんでした。')).toBeInTheDocument();
  });
  it('stays quiet about saved data that belongs to another tool', async () => {
    // Labs moves between tools without a reload, so one tool's failure must not speak for another's.
    reportDiscardedSave('nilay-labs-shot-pattern-v1');
    render(createElement(ShotGroupClient));
    await openSections(/^7\. 記録を保存/);
    const notice = '保存されていた設定を読み取れなかったため、初期値で開いています。';
    expect(screen.queryAllByText(notice)).toHaveLength(0);
    act(() => reportDiscardedSave(key));
    // Twice at once: the visible line, and the region that speaks it.
    expect(screen.getAllByText(notice)).toHaveLength(2);

    // The notice has a region of its own rather than riding on the debounced summary, which is
    // atomic and would read the notice out again on every change of the result.
    act(() => {
      useShotGroupStore.getState().addImpactAtOffset({ x: 0, y: 0 });
    });
    await waitFor(() => expect(screen.getByText(/群の大きさは 2 発目から求まります。/)).toBeInTheDocument(), {
      timeout: 2000,
    });
    expect(screen.getAllByText(notice)).toHaveLength(2);
  });
});
