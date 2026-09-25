import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';

import { test, expect, type Page } from './fixtures';

// A result figure is a label followed by its value; the scale's own figures are a term and its definition.
const value = (page: Page, label: string) => page.locator(`:is(dt, p):text-is("${label}") + :is(dd, p)`);

/** Opens a closed section by its title, as a reader would before using what is inside it. */
const open = async (page: Page, title: RegExp) => {
  const toggle = page.getByRole('heading', { name: title }).getByRole('button');
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
};
const openRecords = (page: Page) => open(page, /^6\. 記録を保存/);
const openScale = (page: Page) => open(page, /^2\. 実寸を合わせる/);

const addShot = async (page: Page, x: number, y: number) => {
  await open(page, /^座標で追加・打点の一覧/);
  await page.getByLabel('中心からの左右').fill(String(x));
  await page.getByLabel('中心からの上下').fill(String(y));
  await page.getByRole('button', { name: 'この座標で追加' }).click();
};

const canvasBox = async (page: Page) => {
  const canvas = page.getByRole('img', { name: /パターンボードの作図/ });
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('The workspace canvas is not laid out');
  return box;
};

// A photo is never uploaded, so the test makes one in the page and hands it to the file input.
const choosePhoto = async (page: Page) => {
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#222222';
    context.beginPath();
    context.arc(400, 300, 120, 0, Math.PI * 2);
    context.fill();
    return canvas.toDataURL('image/png').split(',')[1];
  });
  if (!png) throw new Error('Failed to encode the canvas as PNG.');
  await page
    .getByLabel('写真を選ぶ')
    .setInputFiles({ name: 'board.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
};

// A file that claims to be a PNG but cannot be decoded, to reach the image error path.
const chooseBrokenPhoto = (page: Page) =>
  page
    .getByLabel('写真を選ぶ')
    .setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/shot-pattern');
});

test('counts the shots inside the circle and reports the distribution', async ({ page }) => {
  await expect(page).toHaveTitle(/散弾パターンの測定/);
  await expect(page.getByRole('heading', { name: '散弾パターンの測定' })).toBeVisible();
  await addShot(page, 0, 0);
  await addShot(page, 30, 10);
  await addShot(page, -20, -5);
  await addShot(page, 50, 0);
  await expect(value(page, '打点の総数')).toHaveText('4');
  await expect(value(page, '円内の着弾')).toHaveText('3');
  await expect(value(page, '円外の着弾')).toHaveText('1');
  await expect(value(page, 'パターン率')).toHaveText('—');
  await page.getByLabel('装弾の総粒数').fill('6');
  await expect(value(page, 'パターン率')).toHaveText('50%');
  await expect(page.getByText('内円（直径 53.9 cm）の内側と外側')).toBeVisible();
  await expect(page.getByText('右 3.3 cm・上 1.7 cm', { exact: false })).toBeVisible();
  await expect(page.getByText('右上: 2', { exact: true })).toBeVisible();
  await expect(page.getByText('左下: 1', { exact: true })).toBeVisible();
  await expect(page.getByText('右下: 0', { exact: true })).toBeVisible();
});

test('undoes, deletes and clears recorded shots', async ({ page }) => {
  for (const x of [5, 10, 15]) await addShot(page, x, 0);
  await expect(value(page, '打点の総数')).toHaveText('3');
  await page.getByRole('button', { name: '直前を取り消す' }).click();
  await expect(value(page, '打点の総数')).toHaveText('2');
  await expect(page.getByText('1. 右 5 cm / 上 0 cm')).toBeVisible();
  await page.getByRole('button', { name: '1 番目の打点を削除' }).click();
  await expect(value(page, '打点の総数')).toHaveText('1');
  await page.getByRole('button', { name: '打点をすべて消す' }).click();
  await expect(value(page, '打点の総数')).toHaveText('0');
  await expect(page.getByRole('button', { name: '直前を取り消す' })).toBeDisabled();
  await expect(page.getByText('円内に着弾がありません。')).toBeVisible();
});

test('saves a measurement without the photo and restores it after a reload', async ({ page }) => {
  await choosePhoto(page);
  await expect(page.getByText('写真を読み込みました（800 × 600 ピクセル）。')).toBeVisible();
  await addShot(page, 10, 10);
  await addShot(page, 60, 0);
  await page.getByLabel('装弾の総粒数').fill('200');
  await openRecords(page);
  await page.getByLabel('メモ').fill('35 m / フルチョーク');
  await page.getByLabel('記録名').fill('初回');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('保存しました。')).toBeVisible();

  await page.reload();
  await expect(page.getByText('写真なし', { exact: true })).toBeVisible();
  await expect(value(page, '打点の総数')).toHaveText('0');
  await openRecords(page);
  await expect(page.getByText('円内 1 / 打点 2', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '呼び出す' }).click();
  await expect(value(page, '打点の総数')).toHaveText('2');
  await expect(value(page, '円内の着弾')).toHaveText('1');
  await expect(page.getByLabel('メモ')).toHaveValue('35 m / フルチョーク');
  await expect(page.getByLabel('装弾の総粒数')).toHaveValue('200');
  await page.getByRole('button', { name: '「初回」を削除' }).click();
  await page.reload();
  await openRecords(page);
  await expect(page.getByRole('button', { name: '呼び出す' })).toHaveCount(0);
});

test('exports the saved measurements as a CSV file', async ({ page }) => {
  await addShot(page, 12, -8);
  await page.getByLabel('装弾の総粒数').fill('250');
  await openRecords(page);
  await page.getByLabel('記録名').fill('CSV');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV を書き出す' }).click();
  const csv = (await readFile((await (await downloadPromise).path())!)).toString();
  expect(csv).toContain('name,savedAt,diameterCm');
  expect(csv).toContain('CSV,');
  expect(csv).toContain('"12,-8"');
  expect(csv).toContain('250,1,1,0');
});

test('replaces the measurement when a new photo is loaded', async ({ page }) => {
  await addShot(page, 10, 0);
  await expect(value(page, '打点の総数')).toHaveText('1');
  page.once('dialog', (dialog) => dialog.accept());
  await choosePhoto(page);
  await expect(page.getByText('写真を読み込みました（800 × 600 ピクセル）。')).toBeVisible();
  await expect(value(page, '打点の総数')).toHaveText('0');
  await expect(value(page, 'A–B の画面上の長さ')).toHaveText('400 px');
  // The reference points start over with the photo, so the step that places them opens with it.
  await expect(page.getByRole('heading', { name: /^2\. 実寸を合わせる/ }).getByRole('button')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await page.getByRole('button', { name: '写真を外す' }).click();
  await expect(page.getByText('写真なし', { exact: true })).toBeVisible();
});

test('records a shot where the workspace is tapped and ignores a swipe', async ({ page }) => {
  const box = await canvasBox(page);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(value(page, '打点の総数')).toHaveText('1');
  await expect(value(page, '円内の着弾')).toHaveText('1');
  // A swipe longer than the tap threshold scrolls the page instead of recording a shot.
  await page.mouse.move(box.x + box.width / 4, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 4 + 40, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(value(page, '打点の総数')).toHaveText('1');
});

test('moves the circle by dragging it in the workspace', async ({ page }) => {
  const centre = page.getByLabel('中心：左端からの距離');
  await expect(centre).toHaveValue('76.2');
  await page.getByRole('group', { name: '作業エリアを押して置くもの' }).getByText('円', { exact: true }).click();
  const box = await canvasBox(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 80, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(centre).not.toHaveValue('76.2');
  // Dragging the circle never records a shot.
  await expect(value(page, '打点の総数')).toHaveText('0');
});

test('asks before a saved measurement replaces unsaved work', async ({ page }) => {
  await addShot(page, 10, 0);
  await openRecords(page);
  await page.getByLabel('記録名').fill('基準');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await addShot(page, -30, 0);
  await page.getByLabel('メモ').fill('未保存のメモ');
  await expect(value(page, '打点の総数')).toHaveText('2');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: '呼び出す' }).click();
  await expect(value(page, '打点の総数')).toHaveText('2');
  await expect(page.getByLabel('メモ')).toHaveValue('未保存のメモ');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '呼び出す' }).click();
  await expect(value(page, '打点の総数')).toHaveText('1');
  await expect(page.getByLabel('メモ')).toHaveValue('');
});

test('names the field that blocked a save', async ({ page }) => {
  await page.getByLabel('装弾の総粒数').fill('0');
  await expect(page.getByText('1 以上の整数で入力してください。', { exact: true })).toBeVisible();
  await openRecords(page);
  await page.getByLabel('記録名').fill('粒数が 0');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('装弾の総粒数は 1 以上の整数で入力してください。', { exact: true })).toBeVisible();
  await page.getByLabel('装弾の総粒数').fill('250');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('保存しました。')).toBeVisible();
  // The card is relabelled by the switch, so a sentence fixed when the record was saved would be
  // left claiming a language it is not in.
  await page.getByRole('button', { name: '言語を選択' }).click();
  await page.getByRole('menuitem', { name: 'English' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
});

test('asks before starting the measurement over', async ({ page }) => {
  // Starting over is the header reset; it asks first, and cancelling keeps the shots and the note.
  await addShot(page, 10, 0);
  await openRecords(page);
  await page.getByLabel('メモ').fill('残したいメモ');
  await page.getByRole('button', { name: '入力を初期値に戻す' }).click();
  await page.getByRole('button', { name: 'やめる' }).click();
  await expect(value(page, '打点の総数')).toHaveText('1');
  await expect(page.getByLabel('メモ')).toHaveValue('残したいメモ');
  await page.getByRole('button', { name: '入力を初期値に戻す' }).click();
  await page.getByRole('button', { name: '初期値に戻す', exact: true }).click();
  await expect(page.getByText('最初からやり直しました。')).toBeVisible();
  await expect(value(page, '打点の総数')).toHaveText('0');
  await expect(page.getByLabel('メモ')).toHaveValue('');
});

test('asks before a photo change discards the recorded shots', async ({ page }) => {
  await addShot(page, 10, 0);
  page.once('dialog', (dialog) => dialog.dismiss());
  await choosePhoto(page);
  await expect(page.getByText('写真なし', { exact: true })).toBeVisible();
  await expect(value(page, '打点の総数')).toHaveText('1');
  page.once('dialog', (dialog) => dialog.accept());
  await choosePhoto(page);
  await expect(page.getByText('写真を読み込みました（800 × 600 ピクセル）。')).toBeVisible();
  await expect(value(page, '打点の総数')).toHaveText('0');
  await addShot(page, 5, 0);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: '写真を外す' }).click();
  await expect(page.getByText('写真を読み込みました（800 × 600 ピクセル）。')).toBeVisible();
  await expect(value(page, '打点の総数')).toHaveText('1');
});

test('discards the shots it warned about even when the photo cannot be read', async ({ page }) => {
  await addShot(page, 10, 0);
  await openScale(page);
  await page.getByLabel('基準点 B：左端からの距離').fill('700');
  await expect(value(page, 'A–B の画面上の長さ')).toHaveText('400 px');
  page.once('dialog', (dialog) => dialog.accept());
  await chooseBrokenPhoto(page);
  await expect(page.getByText('画像を読み込めませんでした。別の写真を選んでください。')).toBeVisible();
  // Accepting the warning discarded the shots and the frame, whether or not the photo decoded.
  await expect(value(page, '打点の総数')).toHaveText('0');
  await expect(value(page, 'A–B の画面上の長さ')).toHaveText('600 px');
  await expect(page.getByRole('button', { name: '写真を外す' })).toHaveCount(0);
});

test('undoes the deletion of a saved measurement', async ({ page }) => {
  await addShot(page, 10, 0);
  await openRecords(page);
  await page.getByLabel('記録名').fill('初回');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '「初回」を削除' }).click();
  await expect(page.getByRole('button', { name: '呼び出す' })).toHaveCount(0);
  await expect(page.getByText('「初回」を削除しました。')).toBeVisible();
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  await expect(page.getByRole('button', { name: '呼び出す' })).toHaveCount(1);
  await page.reload();
  await openRecords(page);
  await expect(page.getByText('円内 1 / 打点 1', { exact: false })).toBeVisible();
});

test('places the reference points without a pointer', async ({ page }) => {
  await openScale(page);
  await expect(value(page, 'A–B の画面上の長さ')).toHaveText('600 px');
  await page.getByLabel('基準点 B：左端からの距離').fill('700');
  await expect(value(page, 'A–B の画面上の長さ')).toHaveText('400 px');
  await page.getByLabel('基準点 A：上端からの距離').fill('150');
  await expect(value(page, 'A–B の画面上の長さ')).toHaveText('500 px');
  await expect(value(page, '1 ピクセルあたり')).toHaveText('0.1524 cm');
  await page.getByLabel('基準点 A：左端からの距離').fill('');
  await expect(page.getByText('座標を数値で入力してください。')).toBeVisible();
  await expect(value(page, '1 ピクセルあたり')).toHaveText('—');
});

test('explains an unusable scale and stops the measurement', async ({ page }) => {
  await addShot(page, 10, 0);
  await openRecords(page);
  await page.getByLabel('記録名').fill('無効な基準');
  await openScale(page);
  await page.getByLabel('基準点 A–B の実寸').fill('');
  await expect(page.getByText('0 より大きい長さを入力し、A と B を離して置いてください。')).toBeVisible();
  await expect(page.getByText('実寸の基準を設定してください（手順 2）。')).toBeVisible();
  await expect(value(page, '円内の着弾')).toHaveText('—');
  // The circle is still described: its diameter does not depend on the scale.
  await expect(page.getByRole('img', { name: /直径 76.2 cm の円/ })).toBeVisible();
  await expect(page.getByText('1. —')).toBeVisible();
  await expect(page.getByRole('button', { name: '1 番目の打点を削除' })).toBeVisible();
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  await page.getByLabel('基準点 A–B の実寸').fill('76.2');
  await expect(value(page, '円内の着弾')).toHaveText('1');
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
});

test('says when the saved measurements could not be read', async ({ page }) => {
  await page.addInitScript(() =>
    window.localStorage.setItem(
      'nilay-labs-shot-pattern-v1',
      JSON.stringify({ state: { language: 'fr' }, version: 0 }),
    ),
  );
  await page.goto('/labs/shot-pattern');
  const notice = '保存されていた設定を読み取れなかったため、初期値で開いています。';
  await expect(page.locator('p:not(.sr-only)').filter({ hasText: notice })).toBeVisible();
  // The visual line arrives with its text already set, so a region of its own has to carry it too.
  // The notice keeps that region to itself: a status region is atomic, and sharing one with the
  // result would read the notice out again after every change.
  await expect(page.locator('p[role="status"].sr-only').filter({ hasText: notice })).toHaveText(notice);
  await expect(page.getByRole('spinbutton', { name: '円の直径 (cm)', exact: true })).toHaveValue('76.2');
});

test('announces the result only once the input settles', async ({ page }) => {
  // Three sr-only regions are on the page: the discarded-save notice, the settled result, and the
  // workspace message while it has nothing to say. Only the second one is under test here.
  const live = page.locator('p[role="status"].sr-only');
  await expect(live.filter({ hasText: '円内の着弾' })).toHaveCount(0);
  await addShot(page, 10, 0);
  await page.getByLabel('装弾の総粒数').fill('4');
  const result = live.filter({ hasText: '円内の着弾' });
  await expect(result).toHaveText('円内の着弾 1 点、打点の総数 1 点。パターン率 25%。');
  // Typing the next digit changes the figure on screen at once. The spoken line has to lag it, or
  // every keystroke of a three-digit count is read out on the way. Both are read in one go, so
  // what is compared is a single moment rather than two polls that could straddle the wait.
  await page.getByLabel('装弾の総粒数').fill('8');
  const moment = await page.evaluate(() => ({
    onScreen: document.body.innerText.includes('12.5%'),
    spoken: [...document.querySelectorAll('p[role="status"].sr-only')]
      .map((node) => node.textContent)
      .find((text) => text?.includes('円内の着弾')),
  }));
  expect(moment.onScreen).toBe(true);
  expect(moment.spoken).toBe('円内の着弾 1 点、打点の総数 1 点。パターン率 25%。');
  await expect(result).toHaveText('円内の着弾 1 点、打点の総数 1 点。パターン率 12.5%。');
});

test('restates the message about a shot in the language chosen after it', async ({ page }) => {
  await addShot(page, 10, -5);
  const message = page.getByText('右 10 cm、下 5 cm に打点を追加しました。');
  await expect(message).toBeVisible();
  // The sentence runs through the direction words and the number format, so it cannot simply be
  // kept as written: the card is relabelled by the switch and the text has to follow.
  await page.getByRole('button', { name: '言語を選択' }).click();
  await page.getByRole('menuitem', { name: 'English' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Added a shot at right 10 cm, down 5 cm.')).toBeVisible();
});

test('keeps the photo and detection notes together, in both languages', async ({ page }) => {
  const notes = page.getByRole('button', { name: /^撮影と自動検出の注意/ });
  await expect(notes).toContainText('重なった痕、撮影角度、ボードのたわみ');
  await open(page, /^撮影と自動検出の注意/);
  await expect(page.getByText('自動検出は粒の大きさの丸い暗い痕を数えます', { exact: false })).toBeVisible();
  await expect(page.getByText('正面から撮影してください。', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '言語を選択' }).click();
  await page.getByRole('menuitem', { name: 'English' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /^Photos and detection/ })).toContainText(
    'Overlapping holes, camera angle, board flatness',
  );
  await expect(page.getByText('counts round dark marks', { exact: false })).toBeVisible();
  await expect(page.getByText('photograph it straight on', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Shotgun Pattern Measurement' })).toBeVisible();
  await expect(page.getByLabel('Choose a photo')).toBeVisible();
});

test('describes the drawing for assistive technology and reflows when narrow', async ({ page }) => {
  await addShot(page, 10, 10);
  await expect(
    page.getByRole('img', { name: 'パターンボードの作図。直径 76.2 cm の円と、1 点の着弾。' }),
  ).toBeVisible();
  await page.setViewportSize({ width: 320, height: 667 });
  await expect(page.getByLabel('中心からの左右')).toBeVisible();
  await expect(page.getByRole('button', { name: 'この座標で追加' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Labs 一覧に戻る' }).click();
  await expect(page.getByRole('heading', { name: /Labs/ })).toBeVisible();
});

test('finds the pellet holes in a photo and turns them into shots', async ({ page }) => {
  // A board drawn in the page: five pellet holes 8 px across, on white, inside the circle.
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#101010';
    for (const [x, y] of [
      [400, 300],
      [340, 300],
      [460, 300],
      [400, 240],
      [400, 360],
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
    .setInputFiles({ name: 'holes.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.getByText('写真を読み込みました（800 × 600 ピクセル）。')).toBeVisible();

  // 400 px between the reference points stand for 76.2 cm, so 15.24 mm is the 8 px the holes are.
  await open(page, /^自動検出の設定/);
  await page.getByLabel('粒の直径').fill('15.24');
  await page.getByRole('button', { name: '写真から自動で検出' }).click();
  await expect(page.getByText('5 点を検出し、打点を置き換えました。', { exact: false })).toBeVisible();
  await expect(page.getByText('円内の着弾 5 点、打点の総数 5 点。', { exact: false })).toBeAttached();

  // The reading is a starting point: what it found can still be undone by hand.
  await page.getByRole('button', { name: '直前を取り消す' }).click();
  await expect(page.getByText('円内の着弾 4 点、打点の総数 4 点。', { exact: false })).toBeAttached();
});

test('offers the camera and holds the automatic reading until it can run', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'カメラで撮影する' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '写真から自動で検出' })).toBeDisabled();
  // The folded settings still say how faint a mark has to be.
  await expect(page.getByRole('button', { name: /^自動検出の設定/ })).toContainText('明るさで 50 段階以上暗い痕');
});

test('asks for the pellet count up front and keeps the result beside the workspace', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // The count is not kept between visits, so the step that asks for it opens with the page.
  const circle = page.getByRole('heading', { name: /^3\. 円と総粒数/ }).getByRole('button');
  await expect(circle).toHaveAttribute('aria-expanded', 'true');
  await page.getByLabel('装弾の総粒数').fill('4');
  await expect(circle).toContainText('直径 76.2 cm ・ 総粒数 4');
  await circle.click();
  await expect(circle).toHaveAttribute('aria-expanded', 'false');
  const box = await canvasBox(page);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  // Every tap in the workspace changes the answer, which stays in view beside it.
  await expect(value(page, 'パターン率')).toHaveText('25%');
  await expect(value(page, 'パターン率')).toBeInViewport();
});

test('maps the density, compares saved measurements and plans chokes by distance', async ({ page }) => {
  await addShot(page, 0, 0);
  await addShot(page, 5, 5);
  await page.getByLabel('装弾の総粒数').fill('4');
  await open(page, /^密度マップとすき間/);
  await expect(page.getByRole('img', { name: /^密度マップ。空のマス/ })).toBeVisible();

  await openRecords(page);
  await page.getByLabel('装備（銃・チョーク・装弾）').fill('IC');
  await page.getByLabel('距離（銃口から標的）').fill('25');
  await page.getByLabel('記録名').fill('IC 25');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByLabel('装備（銃・チョーク・装弾）').fill('Full');
  await page.getByLabel('距離（銃口から標的）').fill('35');
  await page.getByLabel('記録名').fill('Full 35');
  await page.getByRole('button', { name: '保存', exact: true }).click();

  await open(page, /^記録の比較/);
  await page.getByLabel('IC 25', { exact: true }).check();
  await page.getByLabel('Full 35', { exact: true }).check();
  await expect(page.getByRole('img', { name: '「IC 25」の密度マップ' })).toBeVisible();

  await open(page, /^チョークの計画/);
  await page.getByLabel('撃つ距離（m、カンマ区切り）').fill('25, 35');
  // The comparison above has an IC row too; this is the plan's table.
  const plan = page.getByRole('table', { name: '装備と距離ごとの、測ったパターン率の平均' });
  await expect(plan.getByRole('row', { name: /^IC/ })).toContainText('50%');
});
