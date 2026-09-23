import { test, expect, type Page } from './fixtures';

// The tool renders in the device time zone, so pin it and use fixed days from ?date=.
test.use({ timezoneId: 'Asia/Tokyo' });

const SOLSTICE = '/labs/hunting-hours?date=2026-06-21';

// The coordinate fields appear once the place is no longer a prefecture.
const enterCoordinates = (page: Page) => page.getByLabel('都道府県').selectOption('custom');
// The saved places wait in a closed section.
const openSaved = (page: Page) => page.getByRole('button', { name: /^保存した地点/ }).click();

test('shows the sunrise, the sunset and the length of the interval for a fixed day', async ({ page }) => {
  await page.goto(SOLSTICE);
  await expect(page).toHaveTitle(/銃猟可能時間/);
  await expect(page.getByLabel('都道府県')).toHaveValue('13');
  // 国立天文台の公表値は 4:25 / 19:00。計算値は 4:25:30 / 19:00:02 で、法定の境界に対して安全側に
  // 丸めるため日の出だけ 1 分遅く表示される。長さも丸めた時刻から導くので 1 分短くなる。
  await expect(page.getByText('04:26 – 19:00', { exact: true })).toBeVisible();
  await expect(page.getByText('14 時間 34 分', { exact: true })).toBeVisible();
  await expect(page.getByText('日の出は分単位で切り上げ', { exact: false })).toBeVisible();
  // The screen-reader summary is debounced, so it arrives after the table rather than with it.
  await expect(
    page.getByText('日の出 04:26、日の入り 19:00。銃猟可能 14 時間 34 分。', { exact: true }),
  ).toBeAttached();
});

test('recalculates when another prefecture is selected', async ({ page }) => {
  await page.goto(SOLSTICE);
  await page.getByLabel('都道府県').selectOption('47');
  // 那覇の計算値は 5:37:33 / 19:24:36。日の出は切り上げ、日の入りは切り捨てる。
  await expect(page.getByText('05:38 – 19:24', { exact: true })).toBeVisible();
  await expect(page.getByText('13 時間 46 分', { exact: true })).toBeVisible();
  await expect(page.getByText('県庁所在地（緯度 26.2167、経度 127.6667）で計算します。')).toBeVisible();
  await enterCoordinates(page);
  await expect(page.getByLabel('緯度')).toHaveValue('26.2167');
  await expect(page.getByLabel('経度')).toHaveValue('127.6667');
});

test('steps to the previous and the next day and returns to today', async ({ page }) => {
  await page.goto(SOLSTICE);
  await page.getByRole('button', { name: '前の日' }).click();
  await expect(page.getByLabel('日付')).toHaveValue('2026-06-20');
  // The address follows the day on screen, so a copied link opens the same day.
  await expect(page).toHaveURL(/date=2026-06-20/);
  await page.getByRole('button', { name: '次の日' }).click();
  await page.getByRole('button', { name: '次の日' }).click();
  await expect(page.getByLabel('日付')).toHaveValue('2026-06-22');
  await expect(page).toHaveURL(/date=2026-06-22/);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
  await page.getByRole('button', { name: '今日', exact: true }).click();
  await expect(page.getByLabel('日付')).toHaveValue(today);
  // Back to today is back to the bare address, which keeps meaning "the day you open it".
  await expect(page).toHaveURL(/\/labs\/hunting-hours$/);
  await expect(page.getByRole('heading', { name: '日出から日没まで' }).locator('+ p')).toContainText('今日・');
});

test('leaves the address bare until a day is chosen', async ({ page }) => {
  await page.goto('/labs/hunting-hours');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
  await expect(page.getByLabel('日付')).toHaveValue(today);
  await expect(page).toHaveURL(/\/labs\/hunting-hours$/);
  await page.getByRole('button', { name: '前の日' }).click();
  await expect(page).toHaveURL(/date=\d{4}-\d{2}-\d{2}$/);
});

test('drops a day it cannot read from the address', async ({ page }) => {
  await page.goto('/labs/hunting-hours?date=2026-02-30');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
  await expect(page.getByLabel('日付')).toHaveValue(today);
  await expect(page).toHaveURL(/\/labs\/hunting-hours$/);
});

test('explains coordinates it cannot use and recovers once they are valid', async ({ page }) => {
  await page.goto(SOLSTICE);
  await enterCoordinates(page);
  await page.getByLabel('緯度').fill('200');
  await expect(page.getByText('-90 から 90 の数値を入力してください。')).toBeVisible();
  await expect(page.getByText('緯度と経度を正しく入力してください。')).toBeVisible();
  await page.getByLabel('緯度').fill('43.0667');
  await page.getByLabel('経度').fill('141.35');
  await expect(page.getByText('03:56 – 19:17', { exact: true })).toBeVisible();
  await expect(page.getByLabel('都道府県')).toHaveValue('custom');
});

test('says when a latitude has no sunrise at all', async ({ page }) => {
  await page.goto('/labs/hunting-hours?date=2026-12-22');
  await enterCoordinates(page);
  await page.getByLabel('緯度').fill('78.22');
  await page.getByLabel('経度').fill('15.65');
  await expect(page.getByText('この緯度では、この日は太陽が昇りません', { exact: false })).toBeVisible();
  await page.getByLabel('日付').fill('2026-06-21');
  await expect(page.getByText('この緯度では、この日は太陽が沈みません', { exact: false })).toBeVisible();
});

test('shows a day that has a sunrise but no sunset', async ({ page }) => {
  // 65.8 N is just inside the midnight-sun belt in June, so daylight begins here and does not end.
  await page.goto('/labs/hunting-hours?date=2026-06-16');
  await enterCoordinates(page);
  await page.getByLabel('緯度').fill('65.8');
  await page.getByLabel('経度').fill('0');
  await expect(page.getByText('この日は日の入りがありません', { exact: false })).toBeVisible();
  await expect(page.getByText('この日はありません', { exact: true })).toBeVisible();
  await expect(page.getByText('09:13', { exact: true })).toBeVisible();
  await expect(page.getByText('銃猟が可能な時間帯', { exact: true })).toHaveCount(0);
  await expect(page.getByText('日の出 09:13。この日は日の入りがありません。', { exact: true })).toBeAttached();
});

test('shows a day that has a sunset but no sunrise', async ({ page }) => {
  await page.goto('/labs/hunting-hours?date=2026-06-25');
  await enterCoordinates(page);
  await page.getByLabel('緯度').fill('65.8');
  await page.getByLabel('経度').fill('0');
  await expect(page.getByText('この日は日の出がありません', { exact: false })).toBeVisible();
  await expect(page.getByText('この日はありません', { exact: true })).toBeVisible();
  await expect(page.getByText('08:58', { exact: true })).toBeVisible();
  await expect(page.getByText('日の入り 08:58。この日は日の出がありません。', { exact: true })).toBeAttached();
});

test('keeps the calculated times on a day too short to round', async ({ page }) => {
  // 68.09 N on this day has 0.78 minutes of daylight, so the rounded interval collapses.
  await page.goto('/labs/hunting-hours?date=2026-12-08');
  await enterCoordinates(page);
  await page.getByLabel('緯度').fill('68.09');
  await page.getByLabel('経度').fill('0');
  await expect(page.getByText('日出から日没までが 1 分未満のため', { exact: false })).toBeVisible();
  await expect(page.getByText('20:51:18', { exact: true })).toBeVisible();
  await expect(page.getByText('20:52:05', { exact: true })).toBeVisible();
});

test('saves a place, loads it and keeps it after a reload', async ({ page }) => {
  await page.goto(SOLSTICE);
  await page.getByLabel('都道府県').selectOption('01');
  await openSaved(page);
  await page.getByLabel('地点名').fill('北の猟場');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('保存しました。')).toBeVisible();
  // The only refusal the enabled button can reach is a name already in use.
  await page.getByLabel('地点名').fill('北の猟場');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('同じ名前の地点があります。別の名前にしてください。')).toBeVisible();
  await page.getByLabel('都道府県').selectOption('47');
  await expect(page.getByText('05:38 – 19:24', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^北の猟場/ }).click();
  await expect(page.getByLabel('都道府県')).toHaveValue('01');
  await page.reload();
  // Loaded, the saved place names itself on the answer.
  await expect(page.getByRole('heading', { name: '日出から日没まで' }).locator('+ p')).toContainText('北の猟場');
  await openSaved(page);
  await expect(page.getByRole('button', { name: /^北の猟場/ })).toBeVisible();
  await page.getByRole('button', { name: '「北の猟場」を削除' }).click();
  await expect(page.getByRole('button', { name: /^北の猟場/ })).toHaveCount(0);
  await expect(page.getByText('「北の猟場」を削除しました。')).toBeVisible();
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  await expect(page.getByRole('button', { name: /^北の猟場/ })).toBeVisible();
  await page.reload();
  await openSaved(page);
  await expect(page.getByRole('button', { name: /^北の猟場/ })).toBeVisible();
});

test('explains a date it cannot calculate instead of calling it blank', async ({ page }) => {
  await page.goto(SOLSTICE);
  await page.getByLabel('日付').fill('1500-01-01');
  await expect(
    page.getByText('1583 年 1 月 1 日から 9999 年 12 月 31 日までの日付を入力してください。', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText('日付を入力してください。', { exact: true })).toHaveCount(0);
  await page.getByLabel('日付').fill('2026-06-21');
  await expect(page.getByText('14 時間 34 分', { exact: true })).toBeVisible();
});

test('says when it could not read the settings it had saved', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'nilay-labs-hunting-hours-v1',
      // Every field the schema asks for is here and sound, apart from a latitude off the globe:
      // the one fault has to be the one under test. The place is deliberately not the one the
      // tool opens on, so the fields below tell a dropped save from a save that was taken.
      JSON.stringify({
        state: {
          presetId: '01',
          location: { latitude: 200, longitude: 141.35 },
          locations: [],
        },
        version: 0,
      }),
    );
  });
  await page.goto(SOLSTICE);
  const notice = '保存されていた設定を読み取れなかったため、初期値で開いています。';
  // Visible on its own, and spoken from a region of its own: the visible paragraph arrives with its
  // text already set, and a status region is atomic, so sharing one would repeat the notice all day.
  await expect(page.locator('p:not(.sr-only)').filter({ hasText: notice })).toBeVisible();
  const spoken = page.locator('p.sr-only[role="status"]');
  await expect(spoken.filter({ hasText: notice })).toHaveText(notice);
  await expect(spoken.filter({ hasText: '日の出' })).toHaveText(
    '日の出 04:26、日の入り 19:00。銃猟可能 14 時間 34 分。',
  );
  await expect(page.getByLabel('都道府県')).toHaveValue('13');
  await expect(page.getByText('県庁所在地（緯度 35.6581、経度 139.7414）で計算します。')).toBeVisible();
});

test('shows the article and the e-Gov source, and keeps the language after a reload', async ({ page }) => {
  await page.goto(SOLSTICE);
  // Closed, the section still states the rule the hours come from.
  const legal = page.getByRole('button', { name: /^銃猟の制限/ });
  await expect(legal).toContainText('日出前・日没後');
  await expect(page.getByText('日出前及び日没後においては、銃猟をしてはならない。')).toBeHidden();
  await legal.click();
  await expect(page.getByText('日出前及び日没後においては、銃猟をしてはならない。')).toBeVisible();
  await expect(page.getByText('住居が集合している地域', { exact: false })).toBeVisible();
  await expect(page.getByText('弾丸の到達するおそれのある人', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: /e-Gov/ })).toHaveAttribute(
    'href',
    'https://laws.e-gov.go.jp/law/414AC0000000088',
  );
  await page.getByRole('button', { name: '言語を選択' }).click();
  await page.getByRole('menuitem', { name: 'English' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Shooting hours', { exact: true })).toBeVisible();
  await expect(page.getByText('Unofficial translation.', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Prefecture')).toBeVisible();
});

test('reflows at a narrow viewport and returns to the Labs list', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 667 });
  await page.goto(SOLSTICE);
  await expect(page.getByLabel('日付')).toBeVisible();
  await expect(page.getByText('14 時間 34 分', { exact: true })).toBeVisible();
  // A returning reader opens the page for the hours, so they are on the first screen of a phone.
  await expect(page.getByText('04:26 – 19:00', { exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Labs 一覧に戻る' }).click();
  await expect(page).toHaveURL(/\/labs$/);
});

test.describe('with the device position available', () => {
  test.use({ geolocation: { latitude: 43.0667, longitude: 141.35 }, permissions: ['geolocation'] });

  test('fills the coordinates from the device', async ({ page }) => {
    await page.goto(SOLSTICE);
    await page.getByRole('button', { name: '現在地を使う' }).click();
    await expect(page.getByLabel('緯度')).toHaveValue('43.0667');
    await expect(page.getByLabel('経度')).toHaveValue('141.35');
    await expect(page.getByLabel('都道府県')).toHaveValue('custom');
  });
});

test.describe('with the device position refused', () => {
  test('keeps the manual entry usable and says why', async ({ page, context }) => {
    await context.clearPermissions();
    await page.goto(SOLSTICE);
    await page.getByRole('button', { name: '現在地を使う' }).click();
    // Chromium refuses an ungranted request at once. Firefox neither answers nor honours the timeout
    // the tool asks for, so there it is the tool's own twelve-second net that ends the wait — hence
    // the generous timeout here. Either way the fallback wording is what the reader ends up with.
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      '都道府県を選ぶか、緯度経度を入力してください。',
      { timeout: 15000 },
    );
    await expect(page.getByText('04:26 – 19:00', { exact: true })).toBeVisible();
    // The two halves of that paragraph are one sentence to a reader, so neither may be left in the
    // language it was written in when the other has moved on.
    await page.getByRole('button', { name: '言語を選択' }).click();
    await page.getByRole('menuitem', { name: 'English' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Choose a prefecture or enter coordinates.');
    await expect(page.getByRole('main').getByRole('alert')).not.toContainText('位置情報');
  });
});
