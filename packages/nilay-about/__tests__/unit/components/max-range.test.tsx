import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { storageKey, useMaxRangeStore } from '@/app/(standalone)/labs/max-range/_store';
import { MaxRangeClient } from '@/app/(standalone)/labs/max-range/max-range-client';
import { discardedSaveMessage } from '@/components/labs';
import { reportDiscardedSave, useStorageStatus } from '@/lib/browser-storage';

// Only the shared chrome is stubbed: it needs the Next.js app router, which a unit
// render has not mounted. The notice and its wording stay real.
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

// Two sr-only paragraphs: the discarded-save notice first and the settled summary last, kept apart
// because a status region is atomic and sharing one would repeat the notice on every change.
const spokenRegions = () =>
  screen.getAllByRole('status').filter((node) => node.tagName === 'P' && node.className.includes('sr-only'));

const openingSummary = '最大到達距離 196 m（仰角 24.2 度）。仰角 30 度では 194 m。安全距離ではありません。';

describe('working out how far a shot can carry', () => {
  beforeEach(() => {
    // persist writes on every set, so the reset comes first and the clear leaves storage truly empty.
    useMaxRangeStore.setState(useMaxRangeStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });

  it('has both regions on the page before there is anything to say', () => {
    const { container } = render(<MaxRangeClient />);
    // Rendered with the defaults, and held busy until the saved settings are read.
    expect(container.querySelector('[aria-busy="true"]')).toContainElement(screen.getByLabelText('初速 (m/s)'));
    const regions = spokenRegions();
    expect(regions).toHaveLength(2);
    for (const region of regions) {
      expect(region).toBeEmptyDOMElement();
      expect(region).toHaveAttribute('lang', 'ja');
    }
  });

  it('opens on a lead pellet and says how far it carries and at what angle', async () => {
    render(<MaxRangeClient />);
    await screen.findAllByLabelText('初速', { exact: false });
    // The distance leads the card as a figure, with the angle that reaches it underneath.
    // Scoped to the figure's own label: the tool is called 最大到達距離 too.
    expect(screen.getByText('最大到達距離', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('196 m', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('仰角 24.2 度')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '仰角 30 度' })).toBeInTheDocument();
    const results = screen.getByRole('table', { name: '指定した仰角と、最も遠くまで届く仰角での結果' });
    const carried = within(results).getByRole('row', { name: /到達距離/ });
    expect(within(carried).getByText('194 m')).toBeInTheDocument();
    expect(within(carried).getByText('196 m')).toBeInTheDocument();
    // The angle that carries furthest is named in the column heading, not left to be guessed.
    expect(screen.getByRole('columnheader', { name: '最大（仰角 24.2 度）' })).toBeInTheDocument();
  });

  it('says what the shot still carries where it comes down, beside the distance', async () => {
    render(<MaxRangeClient />);
    await screen.findAllByLabelText('初速', { exact: false });
    const figure = (label: string) => screen.getByText(label, { selector: 'p' }).nextElementSibling;
    // The same landing as the table's greatest column, 22.6 m/s and 0.02 J, set as figures.
    expect(figure('そこでの落下速度')).toHaveTextContent('22.6 m/s');
    expect(figure('そこでの落下エネルギー')).toHaveTextContent('0.02 J');
  });

  it('keeps the air closed with its values in the heading, and opens it when a reading is wrong', async () => {
    render(<MaxRangeClient />);
    await screen.findAllByLabelText('初速', { exact: false });
    const air = screen.getByRole('button', { name: /^大気/ });
    expect(air).toHaveAttribute('aria-expanded', 'false');
    expect(air).toHaveTextContent('15 °C・1,013.25 hPa・現地の気圧');
    fireEvent.change(screen.getByLabelText('気温 (°C)'), { target: { value: '-300' } });
    expect(air).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('気温 (°C)')).toBeVisible();
  });

  it('converts a weight to its new unit, and rereads the answer in the distance unit chosen', async () => {
    const user = userEvent.setup();
    render(<MaxRangeClient />);
    await screen.findAllByLabelText('初速', { exact: false });
    await user.click(screen.getByRole('radio', { name: '単一弾（ライフル弾・スラッグ）' }));
    await user.selectOptions(screen.getByLabelText('弾頭重量の単位'), 'grain');
    // The same bullet, said in grains: 9.7 g is about 149.7 grain.
    expect(useMaxRangeStore.getState().bullet.mass.unit).toBe('grain');
    expect(useMaxRangeStore.getState().bullet.mass.value).toBeCloseTo(149.7, 1);
    await user.click(screen.getByRole('radio', { name: 'yd' }));
    expect(useMaxRangeStore.getState().distanceUnit).toBe('yd');
    expect(screen.getByText('最大到達距離', { selector: 'p' }).nextElementSibling).toHaveTextContent(/^[\d,]+ yd$/);
  });

  it('never lets the distance be read as a safe distance', async () => {
    render(<MaxRangeClient />);
    await screen.findAllByLabelText('初速', { exact: false });
    expect(
      screen.getByText(
        '弾が届き得る距離で、安全距離ではありません。矢先の確認、バックストップ、射線の管理は別に必要です。',
      ),
    ).toBeInTheDocument();
    // The summary a screen reader hears carries the same warning as the one on the page.
    expect(openingSummary).toContain('安全距離ではありません');
  });

  it('reads the settled result out once typing has stopped', async () => {
    vi.useFakeTimers();
    try {
      render(<MaxRangeClient />);
      await act(async () => {
        await useMaxRangeStore.persist.rehydrate();
      });
      const [, summary] = spokenRegions();
      expect(summary).toBeEmptyDOMElement();
      act(() => vi.advanceTimersByTime(700));
      expect(spokenRegions()[1]).toHaveTextContent(openingSummary);
    } finally {
      vi.useRealTimers();
    }
  });

  it('puts the point mass assumption and the ricochet it cannot see in the notes', async () => {
    render(<MaxRangeClient />);
    await screen.findAllByLabelText('初速', { exact: false });
    expect(screen.getByText(/実際の到達距離は計算値より短くなりがちです/)).toBeInTheDocument();
    expect(screen.getByText(/跳弾があり得る場所ではこの計算は上限になりません/)).toBeInTheDocument();
    expect(screen.getByText(/公表されている射撃場の危険範囲は跳弾を含んだ距離です/)).toBeInTheDocument();
    // The sphere table was measured on a sphere far larger than a pellet, and that shows only
    // while a sphere is the projectile.
    expect(screen.getByText(/直径 9\/16 インチ/)).toBeInTheDocument();
  });

  it('names the published figures it was checked against', async () => {
    render(<MaxRangeClient />);
    await screen.findAllByLabelText('初速', { exact: false });
    expect(screen.getByText(/NRA Range Services/)).toBeInTheDocument();
    expect(screen.getByText(/DA PAM 385-63/)).toBeInTheDocument();
    expect(screen.getByText(/Journée の経験則（鉛の球の最大到達距離は/)).toBeInTheDocument();
  });

  it('asks the questions a bullet needs once a bullet is chosen', async () => {
    const user = userEvent.setup();
    render(<MaxRangeClient />);
    await screen.findAllByLabelText('初速', { exact: false });
    await user.click(screen.getByRole('radio', { name: '単一弾（ライフル弾・スラッグ）' }));
    // The drag model is the coefficient's unit, picked inside the same field.
    expect(screen.getByLabelText('弾道係数 (G7)')).toBeInTheDocument();
    expect(screen.getByLabelText('抗力モデル')).toHaveValue('g7');
    expect(screen.queryByLabelText('材質の密度 (kg/m³)')).not.toBeInTheDocument();
    // Journee's rule is about lead spheres, so it goes away with the pellet.
    expect(screen.queryByText(/Journée の経験則では/)).not.toBeInTheDocument();
  });

  it('keeps calculating input that is out of the ordinary, and says what is odd about it', async () => {
    render(<MaxRangeClient />);
    await screen.findAllByLabelText('初速', { exact: false });
    act(() => useMaxRangeStore.getState().setMuzzleSpeed(5000));
    expect(
      screen.getByText(/実在の小火器の範囲外の入力があります（初速が 1,500 m\/s を超えています）/),
    ).toBeInTheDocument();
    // The arithmetic holds, so the figures stay.
    const results = screen.getByRole('table', { name: '指定した仰角と、最も遠くまで届く仰角での結果' });
    expect(within(results).getByRole('row', { name: /到達距離/ }).textContent).not.toContain('—');
  });

  it('stops calculating and says why when a field is emptied', async () => {
    render(<MaxRangeClient />);
    await screen.findAllByLabelText('初速', { exact: false });
    act(() => useMaxRangeStore.getState().setMuzzleSpeed(NaN));
    expect(screen.getByText('エラーのある欄を直してください。')).toBeInTheDocument();
    expect(screen.getAllByText('0 より大きい数値を入力してください。').length).toBeGreaterThan(0);
  });

  it('keeps the distance unit within reach while there is no result', async () => {
    const user = userEvent.setup();
    render(<MaxRangeClient />);
    await screen.findAllByLabelText('初速', { exact: false });
    act(() => useMaxRangeStore.getState().setMuzzleSpeed(NaN));
    await user.click(screen.getByRole('radio', { name: 'yd' }));
    expect(useMaxRangeStore.getState().distanceUnit).toBe('yd');
  });

  it('marks and withholds a value outside the bounds the settings are saved within', async () => {
    render(<MaxRangeClient />);
    const temperature = await screen.findByLabelText(/^気温/);
    fireEvent.change(temperature, { target: { value: '-300' } });
    expect(temperature).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('-60 から 60 °C の間で入力してください。')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: '指定した仰角と、最も遠くまで届く仰角での結果' })).toBeNull();
    fireEvent.change(temperature, { target: { value: '15' } });
    expect(screen.getByRole('table', { name: '指定した仰角と、最も遠くまで届く仰角での結果' })).toBeInTheDocument();

    act(() => useMaxRangeStore.getState().setKind('bullet'));
    const coefficient = screen.getByLabelText(/^弾道係数/);
    fireEvent.change(coefficient, { target: { value: '5' } });
    expect(coefficient).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('0.01 から 2 の間で入力してください。')).toBeInTheDocument();
  });

  it('keeps the greatest distance when only the elevation is mistyped', async () => {
    render(<MaxRangeClient />);
    const elevation = await screen.findByLabelText(/^仰角/);
    fireEvent.change(elevation, { target: { value: '95' } });
    expect(elevation).toHaveAttribute('aria-invalid', 'true');
    const results = screen.getByRole('table', { name: '指定した仰角と、最も遠くまで届く仰角での結果' });
    expect(within(results).getByRole('row', { name: /到達距離/ }).textContent).toMatch(/\d m$/);
  });

  it('owns up when the browser cannot save and when a save was discarded', async () => {
    useStorageStatus.setState({ available: false, discarded: [] });
    render(<MaxRangeClient />);
    await screen.findAllByLabelText('初速', { exact: false });
    // Said where it is seen, not only in the notes, which start closed.
    expect(
      screen
        .getAllByText('このブラウザーでは設定を保存できません。次に開いたときは初期値に戻ります。')
        .filter((node) => !node.closest('[hidden]')),
    ).toHaveLength(1);
    act(() => reportDiscardedSave(storageKey));
    await waitFor(() => expect(spokenRegions()[0]).toHaveTextContent(discardedSaveMessage('ja')));
  });

  it('takes the density of shot from its material, and asks for a number only for another one', async () => {
    const user = userEvent.setup();
    render(<MaxRangeClient />);
    await screen.findAllByLabelText('初速', { exact: false });
    expect(screen.getByRole('radio', { name: '鉛' })).toBeChecked();
    expect(screen.queryByLabelText('材質の密度 (kg/m³)')).toBeNull();
    await user.click(screen.getByRole('radio', { name: '鋼' }));
    expect(useMaxRangeStore.getState().sphere.densityKgPerM3).toBe(7850);
    await user.click(screen.getByRole('radio', { name: 'その他' }));
    expect(screen.getByLabelText('材質の密度 (kg/m³)')).toHaveValue(7850);
    fireEvent.change(screen.getByLabelText('材質の密度 (kg/m³)'), { target: { value: '11000' } });
    expect(useMaxRangeStore.getState().sphere.densityKgPerM3).toBe(11000);
    await user.click(screen.getByRole('radio', { name: '鉛' }));
    expect(useMaxRangeStore.getState().sphere.densityKgPerM3).toBe(11340);
    expect(screen.queryByLabelText('材質の密度 (kg/m³)')).toBeNull();
  });
});
