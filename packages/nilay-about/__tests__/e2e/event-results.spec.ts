import { test, expect } from './fixtures';
import { mockApi } from './labs-push';

const ID = 'abcDEF123_-xyz12';
const view = {
  title: '秋季クレー大会',
  note: '',
  columns: ['順位', '氏名', '点数'],
  rows: [
    ['1', '山田', '25'],
    ['2', '佐藤', '24'],
  ],
  updatedAt: '2026-09-24T03:00:00.000Z',
  expiresAt: '2026-10-24T03:00:00.000Z',
};

test('publishes a pasted table and edits it with the passphrase', async ({ page }) => {
  const created = await mockApi(page, '**/api/labs/results', () => ({
    status: 201,
    body: { id: ID, expiresAt: view.expiresAt },
  }));
  const edits = await mockApi(page, `**/api/labs/results/${ID}`, () => ({ body: view }));

  await page.goto('/labs/event-results');
  await expect(page).toHaveTitle(/大会リザルトの公開/);
  await page.getByLabel('大会名').fill('秋季クレー大会');
  await page.getByLabel('成績表（1 行目は見出し）').fill('順位\t氏名\t点数\n1\t山田\t25\n2\t佐藤\t24');
  await expect(page.getByText(/2 行を読み取りました。/)).toBeVisible();
  await page.getByLabel('主催者の合言葉').fill('club-2026');
  await page.getByLabel('公開期間').selectOption('30');
  await page.getByRole('button', { name: '公開する' }).click();

  await expect(page.getByText('リザルトを公開しました。')).toBeVisible();
  expect(created[0]?.body).toEqual({
    passphrase: 'club-2026',
    days: 30,
    content: { title: '秋季クレー大会', note: '', columns: ['順位', '氏名', '点数'], rows: view.rows },
  });
  await expect(page.getByRole('link', { name: `http://127.0.0.1:3001/labs/event-results/view#${ID}` })).toBeVisible();
  // The passphrase is not kept on the device.
  const saved = await page.evaluate(() => window.localStorage.getItem('nilay-labs-event-results-v1'));
  expect(saved).not.toContain('club-2026');

  await page.getByRole('button', { name: '更新する' }).click();
  await expect(page.getByText('リザルトを更新しました。')).toBeVisible();
  expect(edits.at(-1)).toMatchObject({ method: 'PUT', body: { passphrase: 'club-2026' } });
});

test('shows a table that is too wide before sending it', async ({ page }) => {
  await page.goto('/labs/event-results');
  await page.getByLabel('成績表（1 行目は見出し）').fill(`${'c\t'.repeat(10)}c\n1`);
  await expect(page.getByText(/列は 10 列までです。/)).toBeVisible();
});

test('shows the public page from its link and says when it is gone', async ({ page }) => {
  await mockApi(page, `**/api/labs/results/${ID}`, () => ({ body: view }));
  await page.goto(`/labs/event-results/view#${ID}`);
  await expect(page.getByRole('heading', { name: '秋季クレー大会' })).toBeVisible();
  await expect(page.getByRole('row', { name: '2 佐藤 24' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

  await page.unroute(`**/api/labs/results/${ID}`);
  await mockApi(page, `**/api/labs/results/${ID}`, () => ({ status: 404, body: { error: 'gone' } }));
  await page.reload();
  // The page's own alert, not the router's announcer, which is also an alert.
  await expect(page.getByRole('alert').filter({ hasText: '見つかりません' })).toHaveText(
    '見つかりません。期限が切れたか削除されました。',
  );
});
