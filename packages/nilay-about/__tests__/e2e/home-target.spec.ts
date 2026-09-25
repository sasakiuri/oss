import { readFile } from 'node:fs/promises';

import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/home-target');
});

test('calculates, switches disciplines, and restores a named setup after reload', async ({ page }) => {
  await expect(page).toHaveTitle(/練習用標的の作成/);
  await expect(page.getByText('160.5 cm', { exact: true })).toBeVisible();
  await page.getByLabel('目の高さ').fill('180');
  await expect(page.getByText('169.5 cm', { exact: true })).toBeVisible();
  await page.getByLabel('競技種目', { exact: true }).selectOption('AR10');
  await expect(page.getByText('160 cm', { exact: true })).toBeVisible();
  await page.getByLabel('設定名', { exact: true }).fill('自宅用');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('保存しました。')).toBeVisible();
  await page.getByLabel('目の高さ').fill('170');
  await page.getByRole('button', { name: '自宅用', exact: true }).click();
  await expect(page.getByLabel('目の高さ')).toHaveValue('180');
  await page.reload();
  await expect(page.getByLabel('目の高さ')).toHaveValue('180');
  await expect(page.getByLabel('競技種目', { exact: true })).toHaveValue('AR10');
  await expect(page.getByRole('button', { name: '自宅用', exact: true })).toBeVisible();
});

test('explains invalid input and paper overflow before allowing a PDF download', async ({ page }) => {
  const download = page.getByRole('button', { name: 'PDF をダウンロード' });
  await page.getByLabel('標的までの距離').fill('');
  await expect(download).toBeDisabled();
  await expect(page.getByText('0 より大きい数値を入力してください。')).toBeVisible();
  await page.getByLabel('標的までの距離').fill('50');
  // The dimensions of a named discipline are fixed and stated; only a custom one takes a new diameter.
  await expect(page.getByRole('button', { name: /^競技種目の寸法/ })).toContainText('黒丸の直径 11.24 cm');
  await expect(page.getByLabel('競技の黒丸の直径')).toHaveCount(0);
  await page.getByLabel('競技種目', { exact: true }).selectOption('CUSTOM');
  await page.getByLabel('競技の黒丸の直径').fill('25');
  await expect(page.getByText('この用紙には収まりません。', { exact: false })).toBeVisible();
  await expect(download).toBeDisabled();
  await page.getByLabel('用紙サイズ').selectOption('target');
  await expect(download).toBeEnabled();
  await expect(page.getByRole('img', { name: '印刷する標的のプレビュー' })).toBeVisible();
});

test('downloads a real A4 PDF and validates out-of-bounds API input', async ({ page, request }) => {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF をダウンロード' }).click();
  const download = await downloadPromise;
  const pdf = (await readFile((await download.path())!)).toString();
  expect(pdf).toContain('%PDF-1.7');
  expect(pdf).toContain('/MediaBox [0 0 595.2756 841.8898]');
  expect(pdf).toContain('50 mm - Print at 100%');
  const response = await request.post('/api/home-targets', {
    data: { blackAreaSize: { number: 25, unit: 'cm' }, paper: 'a4' },
  });
  expect(response.status()).toBe(400);
});

test('keeps a failed download retryable and preserves input', async ({ page }) => {
  await page.route('**/api/home-targets', (route) => route.fulfill({ status: 500, json: { error: 'Failed' } }));
  const download = page.getByRole('button', { name: 'PDF をダウンロード' });
  await download.click();
  // Asked for by role, so what assistive technology is offered is what gets checked. The urgency
  // rides on aria-live because swapping the role would count as a new element, and a live region
  // inserted with its text already set is not announced.
  const spoken = (text: string) => page.getByRole('main').getByRole('status').filter({ hasText: text });
  await expect(spoken('PDF を作成できませんでした')).toHaveAttribute('aria-live', 'assertive');
  await expect(download).toBeEnabled();
  await expect(page.getByLabel('目の高さ')).toHaveValue('170');
  // The card is relabelled by the switch, so a sentence fixed when the request failed would be
  // left claiming a language it is not in.
  await page.getByRole('button', { name: '言語を選択' }).click();
  await page.getByRole('menuitem', { name: 'English' }).focus();
  await page.keyboard.press('Enter');
  await expect(spoken('Could not create the PDF.')).toBeVisible();
  await expect(spoken('PDF を作成できませんでした')).toHaveCount(0);
});

test('supports keyboard language selection and stays translated after reload', async ({ page }) => {
  await page.getByRole('button', { name: '言語を選択' }).click();
  await page.getByRole('menuitem', { name: 'English' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Target center height', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download PDF' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Eye height')).toBeVisible();
});

test('reflows at a narrow viewport and returns to the About theme', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 667 });
  await expect(page.getByLabel('目の高さ')).toBeVisible();
  await expect(page.getByRole('button', { name: 'PDF をダウンロード' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Labs 一覧に戻る' }).click();
  await expect(page.getByRole('term').filter({ hasText: '狩猟鳥獣の判別練習' })).toBeVisible();
  // The list is part of the site now rather than a screen of its own, so the way back to the
  // front page is the site's own navigation.
  await page.getByRole('link', { name: '[Home]' }).click();
  await expect(page.getByRole('heading', { name: 'ようこそ！！' })).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(192, 192, 192)');
});

test('keeps the last complete settings when reloaded during an empty numeric draft', async ({ page }) => {
  await page.getByLabel('目の高さ').fill('185');
  await page.getByLabel('標的までの距離').fill('7');
  await page.getByLabel('標的までの距離').fill('');
  await expect(page.getByRole('button', { name: 'PDF をダウンロード' })).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel('目の高さ')).toHaveValue('185');
  await expect(page.getByLabel('標的までの距離')).toHaveValue('7');
});

test('edits a saved setup and undoes its deletion', async ({ page }) => {
  await page.getByLabel('設定名', { exact: true }).fill('自宅');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByLabel('目の高さ').fill('182');
  await page.getByRole('button', { name: '「自宅」を編集', exact: true }).click();
  await page.getByRole('button', { name: '現在の条件で上書き' }).click();
  await page.getByRole('button', { name: '「自宅」を編集', exact: true }).click();
  await page.getByLabel('新しい設定名').fill('立射');
  await page.getByRole('button', { name: '名前を変更', exact: true }).click();
  await page.getByRole('button', { name: '「立射」を編集', exact: true }).click();
  await page.getByRole('button', { name: '削除', exact: true }).click();
  await expect(page.getByRole('button', { name: '立射', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  await page.getByLabel('目の高さ').fill('170');
  await page.getByRole('button', { name: '立射', exact: true }).click();
  await expect(page.getByLabel('目の高さ')).toHaveValue('182');
  await page.reload();
  await expect(page.getByRole('button', { name: '立射', exact: true })).toBeVisible();
});

test('shares print settings with a fresh browser and handles invalid links', async ({ page, browser }) => {
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('Denied')) },
    }),
  );
  await page.getByLabel('目の高さ').fill('183');
  await page.getByRole('button', { name: /^印刷の設定/ }).click();
  await page.getByLabel('1 ページの標的数').selectOption('4');
  await page.getByLabel('設置条件を余白に印字').check();
  await page.getByRole('button', { name: '条件の共有リンクをコピー' }).click();
  const link = await page.getByLabel('共有リンク', { exact: true }).inputValue();
  // Nothing else has been done yet, so the instruction is the only thing in the region: it has to
  // bring the region out of hiding by itself, or it would be announced and never seen.
  const instruction = '下のリンクを選択してコピーしてください。';
  await expect(page.getByRole('main').getByRole('status').filter({ hasText: instruction })).not.toHaveClass(/sr-only/);
  // Saving and then removing a setup leaves the settings on screen alone, so the link still
  // describes them and the field to copy it from has to stay.
  await page.getByLabel('設定名', { exact: true }).fill('捨てる');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '「捨てる」を編集' }).click();
  await page.getByRole('button', { name: '削除', exact: true }).click();
  await expect(page.getByLabel('共有リンク', { exact: true })).toHaveValue(link);
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(page.getByText('元に戻しました。')).toBeVisible();
  // Copying again fails again — on a browser without the clipboard this is the ordinary path — and
  // it has to clear what came before it, or the region would still be reporting the undo.
  await page.getByRole('button', { name: '条件の共有リンクをコピー' }).click();
  // This one first: the click resolves before the handler does, and the region already satisfies
  // the check below from the previous copy, so without a gate on the new state it proves nothing.
  await expect(page.getByText('元に戻しました。')).toHaveCount(0);
  // On the class again, not on visibility: sr-only keeps a 1px box, so a hidden region passes
  // toBeVisible and the instruction would be announced to a reader nobody can see it as.
  await expect(page.getByRole('main').getByRole('status').filter({ hasText: instruction })).not.toHaveClass(/sr-only/);
  // Moving the settings is what makes it stale, and it is withdrawn however they moved — by hand
  // here, by loading a different setup, or by another link being opened in this same page.
  await page.getByLabel('目の高さ').fill('160');
  await expect(page.getByLabel('共有リンク', { exact: true })).toHaveCount(0);
  // The instruction points at the field, so it cannot outlive it and leave nothing below.
  await expect(page.getByText(instruction)).toHaveCount(0);
  await page.getByLabel('目の高さ').fill('183');
  await expect(page.getByLabel('共有リンク', { exact: true })).toHaveValue(link);
  // Opening someone else's link in this same page replaces the settings without any control here
  // being touched. The offer has to go with them, or it would hand on the wrong setup.
  const elsewhere = new URL(link);
  elsewhere.hash = elsewhere.hash.replace('%22number%22%3A183', '%22number%22%3A175');
  // Checked so that a change to the defaults cannot leave this replacing nothing and the test
  // passing on an unchanged link. Which field it hit is settled by the assertion below.
  expect(elsewhere.hash).not.toBe(new URL(link).hash);
  await page.evaluate((href) => window.location.replace(href), elsewhere.href);
  await expect(page.getByLabel('目の高さ')).toHaveValue('175');
  await expect(page.getByLabel('共有リンク', { exact: true })).toHaveCount(0);
  const other = await browser.newPage();
  try {
    await other.goto(link);
    await expect(other.getByLabel('目の高さ')).toHaveValue('183');
    await expect(other.getByLabel('1 ページの標的数')).toHaveValue('4');
    await expect(other.getByLabel('設置条件を余白に印字')).toBeChecked();
    await other.goto(new URL('/labs/home-target#setup=broken', link).href);
    await expect(other.getByText('共有リンクの条件を読み込めませんでした。', { exact: false })).toBeVisible();
    await expect(other.getByLabel('目の高さ')).toHaveValue('183');
  } finally {
    await other.close();
  }
});

test('prints four circles at the previewed size with optional setup notes', async ({ page }) => {
  await page.getByRole('button', { name: /^印刷の設定/ }).click();
  await page.getByLabel('1 ページの標的数').selectOption('4');
  await page.getByLabel('設置条件を余白に印字').check();
  // Closed again, the section still states what will be printed.
  await page.getByRole('button', { name: /^印刷の設定/ }).click();
  await expect(page.getByRole('button', { name: /^印刷の設定/ })).toContainText('A4・1 ページに 4 個・設置条件を印字');
  await expect(page.getByRole('img', { name: '印刷する標的のプレビュー' }).locator('circle')).toHaveCount(4);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF をダウンロード' }).click();
  const pdf = (await readFile((await (await downloadPromise).path())!)).toString();
  expect(pdf.match(/c f/g)).toHaveLength(4);
  expect(pdf).toContain('Eye: 170 cm   Distance: 5 m');
  expect(pdf).toContain('Center: 160.5 cm   Diameter: 1.12 cm');
});

test('keeps the height and the download beside the setup on a wide screen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByLabel('標的までの距離').focus();
  await expect(page.getByText('160.5 cm', { exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'PDF をダウンロード' })).toBeInViewport();
});

test('prints corner marks for correcting a photo when asked', async ({ page }) => {
  await page
    .getByRole('heading', { name: /^印刷の設定/ })
    .getByRole('button')
    .click();
  await page.getByLabel('四隅に写真補正用の目印を印刷').check();
  await expect(page.getByText('A4 は 186 × 273 mm', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^印刷の設定/ })).toContainText('四隅に目印');
  const request = page.waitForRequest('**/api/home-targets');
  await page.getByRole('button', { name: 'PDF をダウンロード' }).click();
  expect((await request).postDataJSON()).toMatchObject({ markers: true });
});
