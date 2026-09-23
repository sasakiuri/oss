import { test, expect, type Page } from './fixtures';

// A plain <table> carries its role implicitly, which a CSS attribute selector cannot see.
const table = 'table';

// The conditions most readers leave alone start closed, with their values in the heading.
const open = (page: Page, name: RegExp) => page.getByRole('button', { name }).click();
const tableRange = /^表の距離と的の半径/;

/** The point blank range: the value line under the lead figure's label. */
const pointBlank = (page: Page) =>
  page.getByText('最大直接照準距離（無風）', { exact: true }).locator('xpath=following-sibling::p[1]');

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/trajectory');
});

test('prints the table the default setup asks for and keeps it after reload', async ({ page }) => {
  await expect(page).toHaveTitle(/弾道計算とゼロイン/);
  const rows = page.locator(`${table} tbody tr`);
  // 50 m steps out to 500 m, from a 100 m zero.
  await expect(rows).toHaveCount(10);
  const last = rows.last();
  await expect(last.getByRole('rowheader')).toHaveText('500');
  // Drop in centimetres, or in the MOA or mil a sight is turned in, and the time of flight last.
  await expect(last.locator('td').first()).toHaveText('206.6');
  await expect(last.locator('td').last()).toHaveText('0.789');
  await expect(rows.nth(5).locator('td').first()).toHaveText('50.3');
  // Scoped: the card's unit select offers the same words.
  const tableUnits = page.getByRole('group', { name: '落差と風偏の単位' });
  await tableUnits.getByText('MOA', { exact: true }).click();
  await expect(last.locator('td').first()).toHaveText('14.2');
  await tableUnits.getByText('mil', { exact: true }).click();
  await expect(last.locator('td').first()).toHaveText('4.13');
  await expect(page.getByText('3,488 J', { exact: true })).toBeVisible();
  await expect(page.getByText('2,573 ft-lb', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: tableRange })).toContainText('50 m 刻みで 500 m まで');
  await open(page, tableRange);
  await page.getByRole('spinbutton', { name: '最大距離 (m)', exact: true }).fill('300');
  await expect(rows).toHaveCount(6);
  await expect(rows.last().getByRole('rowheader')).toHaveText('300');
  await page.reload();
  await expect(page.getByRole('button', { name: tableRange })).toContainText('300 m まで');
  await open(page, tableRange);
  await expect(page.getByRole('spinbutton', { name: '最大距離 (m)', exact: true })).toHaveValue('300');
  await expect(page.locator(`${table} tbody tr`)).toHaveCount(6);
});

test('answers with both crossings and the point blank range', async ({ page }) => {
  // The bullet crosses the sight line on the way up at 48 m and comes back to it at the 100 m zero.
  await expect(page.getByText('48 m / 100 m', { exact: true })).toBeVisible();
  await expect(page.getByText('近 / 遠。100 m は遠い方。')).toBeVisible();
  await page.getByLabel('ゼロイン距離').fill('25');
  await expect(page.getByText('近 / 遠。25 m は近い方。')).toBeVisible();
  await expect(page.getByText('25 m / 184.8 m', { exact: true })).toBeVisible();
  await page.getByLabel('ゼロイン距離').fill('100');
  await expect(pointBlank(page)).toHaveText('203.8 m');
  await expect(page.locator('p', { hasText: '狙点のまま当たります' })).toContainText('174.7 m でゼロインすると');
  // The results themselves are not a live region; a settled summary is announced instead.
  await expect(page.locator('p.sr-only[role="status"]').filter({ hasText: 'ゼロイン' })).toHaveText(
    '100 m ゼロインで、500 m の落差は 206.6 cm。無風での最大直接照準距離は 203.8 m です。',
  );
});

test('measures the point blank window with the drift as well as the drop', async ({ page }) => {
  // The still air figure is the one to sight in by, so the wind never moves it.
  await expect(pointBlank(page)).toHaveText('203.8 m');
  // The default 4 m/s from nine o'clock carries the bullet out of a 5 cm circle sideways long
  // before the drop would have taken it out of the bottom.
  await expect(page.locator('p', { hasText: '的の円から外れます' })).toContainText('85.4 m');
  await page.getByLabel('風速 (m/s)').fill('0');
  await expect(page.locator('p', { hasText: '的の円から外れます' })).toHaveCount(0);
  // A scope further above the bore than the circle is wide has no such range at all.
  await open(page, tableRange);
  await page.getByLabel('許容半径').fill('2');
  await expect(page.locator('p', { hasText: '狙点のまま当たります' })).toHaveCount(0);
  await expect(page.getByText('最大直接照準距離はありません', { exact: false })).toBeVisible();
});

test('reads the same shot in yards and inches', async ({ page }) => {
  await page.getByLabel('距離の単位').selectOption('yd');
  await open(page, tableRange);
  await page.getByLabel('落差・風偏の長さの単位').selectOption('inch');
  // The numbers that were typed keep their value and are reread in the new unit.
  await expect(page.getByLabel('ゼロイン距離')).toHaveValue('100');
  const heads = page.locator(`${table} thead th`);
  await expect(heads.first()).toHaveText('距離yd');
  await expect(heads.nth(1)).toHaveText('落差inch');
  const last = page.locator(`${table} tbody tr`).last();
  await expect(last.getByRole('rowheader')).toHaveText('500');
  await expect(last.locator('td').first()).toHaveText('64.4');
  await expect(last.locator('td').nth(1)).toHaveText('21.2');
});

test('asks only for the readings the chosen pressure source uses', async ({ page }) => {
  await open(page, /^大気/);
  // A pressure read at the firing point already carries the height of the place.
  await expect(page.getByLabel('気圧 (hPa)')).toBeVisible();
  await expect(page.getByLabel('標高 (m)')).toHaveCount(0);
  // A sea level reading is the one that needs the height beside it.
  await page.getByLabel('気圧の求め方').selectOption('sea-level');
  await expect(page.getByLabel('気圧 (hPa)')).toBeVisible();
  await expect(page.getByLabel('標高 (m)')).toBeVisible();
  await page.getByLabel('標高 (m)').fill('2000');
  await expect(page.getByText('0.961 kg/m³')).toBeVisible();
  // With no reading at all there is nothing to enter but the height, and the answer is the same
  // one, because the default sea level pressure is the standard 1013.25 hPa.
  await page.getByLabel('気圧の求め方').selectOption('altitude');
  await expect(page.getByLabel('気圧 (hPa)')).toHaveCount(0);
  await expect(page.getByText('0.961 kg/m³')).toBeVisible();
  await expect(page.getByText('標準大気の 78.5 %')).toBeVisible();
  // Thinner air, so the same shot drops 188 cm at 500 m instead of 206.6 cm.
  await expect(page.locator(`${table} tbody tr`).last().locator('td').first()).toHaveText('188');
  await expect(page.getByText('海面更正値', { exact: false })).toBeVisible();
});

test('pushes the bullet away from the hour the wind comes from', async ({ page }) => {
  // The second data cell of a row is the drift in the chosen unit; the first is the drop.
  const drift = page.locator(`${table} tbody tr`).last().locator('td').nth(1);
  await expect(drift).toHaveText('65.6');
  await page.getByLabel('風向', { exact: true }).selectOption('3');
  await expect(drift).toHaveText('-65.6');
  await page.getByLabel('風向', { exact: true }).selectOption('12');
  // A head wind moves nothing sideways, though it does add a little to the drop.
  await expect(drift).toHaveText('0');
  await page.getByLabel('風向', { exact: true }).selectOption('custom');
  await expect(page.getByLabel('風向の角度')).toHaveValue('270');
  await page.getByLabel('風向の角度').fill('400');
  await expect(page.getByText('0 から 360 の範囲で入力してください。')).toBeVisible();
});

test('explains invalid input beside the field without losing the page', async ({ page }) => {
  await page.getByLabel('弾道係数 BC').fill('');
  await expect(page.getByText('0.01 から 2 の範囲で入力してください。')).toBeVisible();
  await expect(page.getByText('エラーのある欄を直してください。').first()).toBeVisible();
  await page.getByLabel('弾道係数 BC').fill('0.45');
  await expect(page.locator(`${table} tbody tr`)).toHaveCount(10);
  await page.getByLabel('ゼロイン距離').fill('');
  await expect(page.getByText('0 より大きい数値を入力してください。').first()).toBeVisible();
});

test('shows the notes and stays translated after reload', async ({ page }) => {
  await open(page, /^計算方法と注意/);
  await open(page, /^大気/);
  await expect(page.getByText('入力はこのブラウザーに保存されます。', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: /^計算方法と注意/ })).toContainText('実射で確認してください');
  await expect(page.getByText('コリオリの効果', { exact: false })).toBeVisible();
  await expect(page.getByText('その日の高気圧・低気圧は反映されません', { exact: false })).toBeVisible();
  await expect(page.getByText('NATO mil', { exact: false })).toBeVisible();
  await expect(page.getByText('射撃場の規則に従い', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '言語を選択' }).click();
  await page.getByRole('menuitem', { name: 'English' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Muzzle energy', { exact: true })).toBeVisible();
  await expect(page.getByText('Point blank range, still air', { exact: true })).toBeVisible();
  await expect(page.locator(`${table} thead th`).first()).toHaveText('Distancem');
  await page.reload();
  await expect(page.getByLabel('Zero distance', { exact: false })).toBeVisible();
  await expect(page.getByText('Muzzle energy', { exact: true })).toBeVisible();
});

test('builds a card that carries the conditions, and prints the sheet alone', async ({ page }) => {
  const preview = page.getByRole('img', { name: '印刷するカードのプレビュー' });
  await expect(preview).toBeVisible();
  // The card opens on drop and drift out to 300 m, beside a 500 m table.
  await expect(preview).toContainText('初速 800 m/s');
  await expect(preview).toContainText('BC 0.45 G1');
  await expect(preview).toContainText('ゼロイン 100 m');
  await expect(preview).toContainText('風 4 m/s 9 時');
  await expect(page.getByText('1 枚 91 × 55 mm', { exact: false })).toBeVisible();
  await page.getByLabel('銃の名前').fill('Tikka T3x');
  await page.getByLabel('装弾の名前').fill('168 gr');
  await expect(preview).toContainText('Tikka T3x / 168 gr');
  await page.getByLabel('A4 1 枚に並べる数').selectOption('6');
  await expect(preview.locator('rect[stroke]')).toHaveCount(6);
  // The reference line is what proves the printer did not scale the sheet.
  await expect(preview).toContainText('50 mm の基準線／実際のサイズ（100%）で印刷');
  await page.reload();
  await expect(page.getByLabel('銃の名前')).toHaveValue('Tikka T3x');
});

test('prints the page as the page, and the cards only from the button', async ({ page }) => {
  // window.print() has no dialog to close in a headless browser.
  await page.addInitScript(() => {
    Object.defineProperty(window, '__printCount', { value: 0, writable: true });
    window.print = () => {
      (window as unknown as { __printCount: number }).__printCount += 1;
    };
  });
  await page.reload();
  await expect(page.getByRole('img', { name: '印刷するカードのプレビュー' })).toBeVisible();
  // A card is ready, and the browser's own print command still prints the table and the form:
  // that is this tool's output, and a card of six rows does not stand in for it.
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('heading', { name: '弾と銃' })).toBeVisible();
  await expect(page.locator('table')).toBeVisible();
  await expect(page.locator('svg[width="210mm"]')).toHaveCount(0);
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'カードを印刷する' }).click();
  expect(await page.evaluate(() => (window as unknown as { __printCount: number }).__printCount)).toBe(1);
  // The dialog is done with, so the sheet is off the page again.
  await expect(page.locator('svg[width="210mm"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '弾と銃' })).toBeVisible();
});

test('refuses a card the rows do not fit on, and says by how much', async ({ page }) => {
  await page.getByLabel('カードの距離の刻み').fill('10');
  const alert = page.getByRole('main').getByRole('alert');
  await expect(alert).toContainText('行までです');
  await expect(page.getByRole('img', { name: '印刷するカードのプレビュー' })).toHaveCount(0);
  // A larger card takes more rows; the A7 sheet then holds three rather than six.
  await page.getByLabel('カードの大きさ').selectOption('a7');
  await page.getByLabel('A4 1 枚に並べる数').selectOption('6');
  await expect(alert).toContainText('A4 1 枚に 3 枚までです');
  await page.getByLabel('A4 1 枚に並べる数').selectOption('2');
  await page.getByLabel('カードの距離の刻み').fill('50');
  await expect(page.getByRole('img', { name: '印刷するカードのプレビュー' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
});

test('reads the drift column per unit of wind when that is what was asked for', async ({ page }) => {
  const preview = page.getByRole('img', { name: '印刷するカードのプレビュー' });
  await page.getByLabel('風偏の列').selectOption('per-speed');
  await expect(preview).toContainText('風偏 cm/m/s');
  await expect(preview).toContainText('風偏は真横（9 時）の風 1 m/s あたり');
  // The drift of a 1 m/s full value wind is a quarter of the 4 m/s the table is worked out for.
  await page.getByLabel('風偏の列').selectOption('wind');
  await expect(preview).toContainText('風 4 m/s 9 時');
  await page.getByLabel('カードの落差と風偏の単位', { exact: true }).selectOption('mil');
  await expect(preview).toContainText('落差 mil');
});

test('says when saved settings could not be read', async ({ page }) => {
  await page.addInitScript(() =>
    window.localStorage.setItem(
      'nilay-labs-trajectory-v1',
      JSON.stringify({ state: { settings: { muzzleSpeed: null } }, version: 0 }),
    ),
  );
  await page.reload();
  const notice = '保存されていた設定を読み取れなかったため、初期値で開いています。';
  await expect(page.locator('p:not(.sr-only)').filter({ hasText: notice })).toBeVisible();
  await expect(page.getByLabel('初速 (m/s)')).toHaveValue('800');
  // The notice has a region of its own: a status region is atomic, so sharing one with the result
  // would read the notice again after every change.
  const regions = page.locator('p.sr-only[role="status"]');
  await expect(regions.filter({ hasText: notice })).toHaveText(notice);
  await expect(regions.filter({ hasText: 'ゼロイン' })).toContainText('無風での最大直接照準距離は 203.8 m です。');
});

test('scrolls the wide table inside itself at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 667 });
  await expect(page.getByLabel('初速 (m/s)')).toBeVisible();
  await expect(page.locator(`${table} tbody tr`)).toHaveCount(10);
  // Six columns still do not fit a phone, so the region scrolls rather than the page.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const region = page.getByRole('region', { name: '距離ごとの弾道の表' });
  expect(await region.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
  // Scrolled sideways, the distance heading stays over the distances it names.
  await region.evaluate((node) => node.scrollBy(80, 0));
  expect(await region.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  const head = await region.locator('thead th').first().boundingBox();
  const cell = await region.locator('tbody th').first().boundingBox();
  expect(Math.abs((head?.x ?? 0) - (cell?.x ?? 1))).toBeLessThan(1);
  await page.getByRole('link', { name: 'Labs 一覧に戻る' }).click();
  await expect(page.getByRole('heading', { name: /Labs/ })).toBeVisible();
});
