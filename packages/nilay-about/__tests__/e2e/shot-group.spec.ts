import { Buffer } from 'node:buffer';

import { test, expect } from './fixtures';

type Page = import('@playwright/test').Page;

/** Opens a closed section by its title, as a reader would before using what is inside it. */
const open = async (page: Page, title: RegExp) => {
  const toggle = page.getByRole('heading', { name: title }).getByRole('button');
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
};

/** The tool opens on a blank target 600 px wide between the reference points, worth 100 mm. */
const addImpact = async (page: Page, right: string, up: string) => {
  await open(page, /^座標で追加・着弾の一覧/);
  await page.getByLabel('狙点からの左右').fill(right);
  await page.getByLabel('狙点からの上下').fill(up);
  await page.getByRole('button', { name: 'この座標で追加' }).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/shot-group');
});

test('measures a group from coordinates and reads it in MOA', async ({ page }) => {
  await expect(page).toHaveTitle(/着弾群の測定/);
  await addImpact(page, '25', '0');
  await addImpact(page, '-25', '0');
  // Two shots 50 mm apart at 100 m: 50 / 29.09 is 1.72 MOA, and half a milliradian.
  await expect(page.getByText('50 mm', { exact: true })).toBeVisible();
  await expect(page.getByText('穴の中心間。1.72 MOA / 0.5 mil')).toBeVisible();
  await expect(page.getByText('上 0 mm・右 0 mm', { exact: true })).toBeVisible();
  await expect(page.getByText('直線で 0 mm。', { exact: false })).toBeVisible();
  // One MOA at the distance is stated on the folded setup line.
  await expect(page.getByRole('button', { name: /^3\. 狙点・射距離・弾径/ })).toContainText('1 MOA = 29.1 mm');
  // Both shots sit 25 mm from the centre, and they spread along one axis only.
  await open(page, /^6\. 統計で確かめる/);
  await expect(page.getByText('25 mm', { exact: true })).toBeVisible();
  await expect(page.getByText('35.4 mm / 0 mm', { exact: true })).toBeVisible();
  // The results themselves are not a live region; a settled summary is announced instead.
  await expect(page.getByText('2 発。最大中心間距離 50 mm、1.72 MOA。')).toBeAttached();
});

test('adds the outside measure only once a bullet diameter is entered', async ({ page }) => {
  await addImpact(page, '25', '0');
  await addImpact(page, '-25', '0');
  await expect(page.getByText('弾径（手順 3）を入力すると表示します。')).toBeVisible();
  await open(page, /^3\. 狙点・射距離・弾径/);
  await page.getByLabel('弾径 (mm)', { exact: true }).fill('7.82');
  // Centre to centre plus one bullet diameter is what a caliper reads across the outside of the holes.
  await expect(page.getByText('57.8 mm', { exact: true })).toBeVisible();
  await expect(page.getByText('中心間距離 + 弾径', { exact: true })).toBeVisible();
  // The same bullet read as a calibre in inches keeps the same real diameter.
  // Clicking the unit takes focus off the number field, which is what hands the typed text back to
  // the store. `selectOption` changes the value without moving focus, so the blur is made explicit.
  await page.getByLabel('弾径 (mm)', { exact: true }).blur();
  await page.getByLabel('弾径の単位').selectOption('inch');
  await expect(page.getByLabel('弾径 (inch)', { exact: true })).toHaveValue('0.308');
  await expect(page.getByText('57.8 mm', { exact: true })).toBeVisible();
});

test('says what one shot cannot measure and hands the rest to the sight adjustment tool', async ({ page }) => {
  await addImpact(page, '20', '-30');
  await expect(page.getByText('1 発では群の大きさが決まりません。')).toBeVisible();
  await open(page, /^6\. 統計で確かめる/);
  await expect(page.getByText('2 発以上で求まります。')).toBeVisible();
  // One shot is still a mean point of impact, which is what a sight is corrected from.
  await expect(page.getByText('下に 30 mm')).toBeVisible();
  await expect(page.getByText('右に 20 mm')).toBeVisible();
  await page.getByRole('link', { name: '照準調整のクリック数計算を開く' }).click();
  await expect(page).toHaveURL(/\/labs\/sight-adjustment$/);
});

test('keeps saved groups and the chosen unit after a reload', async ({ page }) => {
  await addImpact(page, '25', '0');
  await addImpact(page, '-25', '0');
  const resultUnit = page.getByRole('group', { name: '結果の表示単位' });
  await resultUnit.getByText('cm', { exact: true }).click();
  await expect(page.getByText('5 cm', { exact: true })).toBeVisible();
  await open(page, /^7\. 記録を保存/);
  await page.getByLabel('記録名').fill('100m 初弾調整');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('保存しました。')).toBeVisible();

  await page.reload();
  // The photo and the impacts belong to one session; the saved group and the setup outlive it.
  await expect(resultUnit.getByRole('radio', { name: 'cm' })).toBeChecked();
  // The records are folded away on arrival, and their line says how many there are.
  await expect(page.getByRole('button', { name: /^7\. 記録を保存/ })).toContainText('保存した群 1 件');
  await open(page, /^7\. 記録を保存/);
  await expect(page.getByText('100m 初弾調整')).toBeVisible();
  await expect(page.getByText('2 発 ・ 100 m ・ 50 mm', { exact: false })).toBeVisible();
  await expect(page.getByText('まだ着弾がありません。')).toBeAttached();
});

test('refuses to name a correction while the offsets stay within chance', async ({ page }) => {
  // Four shots straddling the aim point on both axes: the centre is off by a millimetre or two,
  // which is well inside what this much scatter produces by chance.
  await addImpact(page, '-9', '8');
  await addImpact(page, '8', '-7');
  await addImpact(page, '-7', '-9');
  await addImpact(page, '9', '7');
  await expect(
    page.getByText('上下・左右とも、狙点からのズレは偶然の範囲内です。この群では補正の向きを決められません。'),
  ).toBeVisible();
  await open(page, /^6\. 統計で確かめる/);
  await expect(page.getByRole('row', { name: /偶然の範囲/ })).toHaveCount(2);
  // The handoff to the sight adjustment tool stays on screen; the verdict qualifies it rather than
  // hiding it, so the reader can still see what a correction would be.
  await expect(page.getByRole('link', { name: '照準調整のクリック数計算を開く' })).toBeVisible();
  await expect(page.getByText('1 発のばらつき（σ）')).toBeVisible();
  await expect(page.getByText(/3 発 .+ 5 発 .+ 10 発/)).toBeVisible();
});

test('names the axis a group settles and counts the shots a tighter answer needs', async ({ page }) => {
  await addImpact(page, '30', '1');
  await addImpact(page, '31', '-1');
  await addImpact(page, '29', '0');
  await addImpact(page, '30.5', '0.5');
  await expect(
    page.getByText('左右のズレは偶然では説明できません。補正は左右だけにして、上下はそのままにしてください。'),
  ).toBeVisible();
  // The default target of ±10 mm is already met by a group this tight.
  await open(page, /^6\. 統計で確かめる/);
  await expect(page.getByText(/すでに足りています。/)).toBeVisible();
  await page.getByLabel('平均着弾点を決めたい精度').fill('0.5');
  await expect(page.getByText(/合計 \d+ 発必要です。あと \d+ 発です。/)).toBeVisible();

  // The target is a goal rather than a measured length, so the number survives a unit change - and
  // a reload, which the impacts deliberately do not.
  await page.getByLabel('平均着弾点を決めたい精度').blur();
  await page.getByLabel('目標の単位').selectOption('moa');
  await expect(page.getByLabel('平均着弾点を決めたい精度')).toHaveValue('0.5');
  await expect(page.getByText(/この射距離では ±/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('目標の単位')).toHaveValue('moa');
  await expect(page.getByLabel('平均着弾点を決めたい精度')).toHaveValue('0.5');
  // The impacts are not kept, so the result says how to start rather than showing empty figures.
  await expect(
    page.getByText('図で弾痕の中心をタップするか、写真から自動で検出すると、群の大きさと狙点からのズレを表示します。'),
  ).toBeVisible();
});

test('keeps each caution with the step it concerns and stays translated after switching language', async ({ page }) => {
  await expect(page.getByText('カメラの映像と写真は送信も保存もしません。', { exact: false })).toBeVisible();
  await open(page, /^自動検出の感度/);
  await expect(page.getByText('重なった弾痕は 1 つに数え', { exact: false })).toBeVisible();
  await open(page, /^6\. 統計で確かめる/);
  await expect(page.getByText('最大中心間距離は最も離れた 2 発だけで決まり', { exact: false })).toBeVisible();
  await expect(page.getByText('NATO mil', { exact: false })).toBeVisible();
  await addImpact(page, '25', '0');
  await page.getByRole('button', { name: '言語を選択' }).click();
  await page.getByRole('menuitem', { name: 'English' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Group Size Measurement' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^6\. Statistics/ })).toBeVisible();
  await expect(page.getByText('Extreme spread', { exact: true })).toBeVisible();
  await expect(page.getByText('A single shot has no group size.')).toBeVisible();
});

test('reflows at a narrow viewport and returns to the Labs list', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 667 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Labs 一覧に戻る' }).click();
  await expect(page.getByRole('heading', { name: /Labs/ })).toBeVisible();
});

test('finds the bullet holes in a photo and turns them into impacts', async ({ page }) => {
  // A target drawn in the page: four holes 8 px across, on white.
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#101010';
    for (const [x, y] of [
      [350, 260],
      [450, 260],
      [350, 340],
      [450, 340],
    ] as [number, number][]) {
      context.beginPath();
      context.arc(x, y, 4, 0, Math.PI * 2);
      context.fill();
    }
    return canvas.toDataURL('image/png').split(',')[1];
  });
  if (!png) throw new Error('Failed to encode the canvas as PNG.');
  await page
    .getByLabel('写真を選ぶ')
    .setInputFiles({ name: 'target.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.getByText('写真を読み込みました（800 × 600 ピクセル）。')).toBeVisible();

  // The photo opens the step with the bullet diameter, which detection still needs.
  await expect(page.getByRole('heading', { name: /^3\. 狙点・射距離・弾径/ }).getByRole('button')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  // 400 px between the reference points stand for 100 mm, so 2 mm is the 8 px the holes are.
  await open(page, /^3\. 狙点・射距離・弾径/);
  await page.getByLabel('弾径 (mm)', { exact: true }).fill('2');
  await page.getByRole('button', { name: '写真から自動で検出' }).click();
  await expect(page.getByText('4 発を検出し、着弾を置き換えました。', { exact: false })).toBeVisible();
  await expect(page.getByRole('img', { name: '標的の作図。狙点と 4 発の着弾。' })).toBeVisible();
});

test('offers the camera and holds the automatic reading until it can run', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'カメラで撮影する' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '写真から自動で検出' })).toBeDisabled();
  // The folded settings still say how faint a mark has to be.
  await expect(page.getByRole('button', { name: /^自動検出の感度/ })).toContainText('明るさの差が 50 段階以上');
});

test('opens the scale for a new photo and folds it back to the line that states it', async ({ page }) => {
  const scale = page.getByRole('heading', { name: /^2\. 実寸を合わせる/ }).getByRole('button');
  await expect(scale).toHaveAttribute('aria-expanded', 'false');
  await expect(scale).toContainText('A–B 100 mm（写真上 600 px、1 px = 0.1667 mm）');
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  if (!png) throw new Error('Failed to encode the canvas as PNG.');
  await page
    .getByLabel('写真を選ぶ')
    .setInputFiles({ name: 'target.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.getByText('写真を読み込みました（800 × 600 ピクセル）。')).toBeVisible();
  // The reference points start over with the photo, so the step that places them is open.
  await expect(scale).toHaveAttribute('aria-expanded', 'true');
  await page.getByLabel('基準点 A–B の実寸').fill('50');
  await scale.click();
  await expect(scale).toHaveAttribute('aria-expanded', 'false');
  await expect(scale).toContainText('A–B 50 mm（写真上 400 px、1 px = 0.125 mm）');
});

test('keeps the result beside the workspace on a wide screen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await addImpact(page, '25', '0');
  await addImpact(page, '-25', '0');
  await page.getByRole('img', { name: /標的の作図/ }).scrollIntoViewIfNeeded();
  await expect(page.getByText('50 mm', { exact: true })).toBeInViewport();
});

test('reads holes on both sides of a printed bull, and passes over the scoring rings', async ({ page }) => {
  // A target with the printing a real one has: scoring rings, a filled black bull, and four
  // holes - two punched through the black, where the backing shows lighter, and two on the white.
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#202020';
    context.lineWidth = 2;
    for (const radius of [100, 140, 180]) {
      context.beginPath();
      context.arc(400, 300, radius, 0, Math.PI * 2);
      context.stroke();
    }
    context.fillStyle = '#141414';
    context.beginPath();
    context.arc(400, 300, 60, 0, Math.PI * 2);
    context.fill();
    for (const [x, y, shade] of [
      [388, 292, '#f4f4f4'],
      [414, 312, '#f4f4f4'],
      [250, 180, '#141414'],
      [560, 430, '#141414'],
    ] as [number, number, string][]) {
      context.fillStyle = shade;
      context.beginPath();
      context.arc(x, y, 4, 0, Math.PI * 2);
      context.fill();
    }
    return canvas.toDataURL('image/png').split(',')[1];
  });
  if (!png) throw new Error('Failed to encode the canvas as PNG.');
  await page
    .getByLabel('写真を選ぶ')
    .setInputFiles({ name: 'printed.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.getByText('写真を読み込みました（800 × 600 ピクセル）。')).toBeVisible();

  await open(page, /^3\. 狙点・射距離・弾径/);
  await page.getByLabel('弾径 (mm)', { exact: true }).fill('2');
  await page.getByRole('button', { name: '写真から自動で検出' }).click();
  // The bull and the rings are far too large to be holes, so only the four holes are marked.
  await expect(page.getByText('4 発を検出し、着弾を置き換えました。', { exact: false })).toBeVisible();
  await expect(page.getByRole('img', { name: '標的の作図。狙点と 4 発の着弾。' })).toBeVisible();
});

test('reads a sheet through its four corner marks and keeps the choice after reload', async ({ page }) => {
  await open(page, /^2\. 実寸を合わせる/);
  await page.getByRole('group', { name: '実寸の合わせ方' }).getByText('四隅の目印').click();
  await expect(page.getByLabel('目印の中心間（横）')).toHaveValue('186');
  await expect(page.getByLabel('目印の中心間（縦）')).toHaveValue('273');
  await expect(page.getByRole('group', { name: '図をタップして置くもの' }).getByText('四隅の目印')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /^2\. 実寸を合わせる/ })).toContainText('四隅の目印');
});

test('keeps several groups on one photo and compares them', async ({ page }) => {
  await addImpact(page, '0', '0');
  await addImpact(page, '10', '0');
  await page.getByRole('button', { name: 'この群を残して次の群を始める' }).click();
  await addImpact(page, '0', '0');
  await addImpact(page, '0', '20');
  await expect(page.getByText('この写真の群：2 群（編集中は群 2）')).toBeVisible();
  const table = page.getByRole('table');
  await expect(table.getByRole('row')).toHaveCount(3);
  await expect(table.getByRole('row', { name: /^1 2 10 mm/ })).toBeVisible();
  await expect(table.getByRole('row', { name: /^2（編集中） 2 20 mm/ })).toBeVisible();
  await page.getByRole('button', { name: '群 1 を編集' }).click();
  await expect(page.getByText('この写真の群：2 群（編集中は群 1）')).toBeVisible();
});
