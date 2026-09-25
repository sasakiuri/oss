import { test, expect } from './fixtures';
import { FAKE_SUBSCRIPTION, mockApi, stubPush, VAPID_KEY } from './labs-push';

const HOOK_ID = 'h'.repeat(43);
const TRIGGER = 'k'.repeat(43);
const MANAGE = 'm'.repeat(43);
const EXPIRES = '2026-12-23T00:00:00.000Z';

test.beforeEach(async ({ page }) => {
  await stubPush(page);
  await mockApi(page, '**/api/labs/push/key', () => ({ body: VAPID_KEY }));
});

test('creates a hook URL, keeps the manage link apart, and deletes it with the manage token', async ({ page }) => {
  const calls = await mockApi(page, '**/api/labs/trap-hooks', ({ method }) =>
    method === 'POST'
      ? {
          status: 201,
          body: {
            hookId: HOOK_ID,
            triggerToken: TRIGGER,
            manageToken: MANAGE,
            label: '沢の箱わな',
            expiresAt: EXPIRES,
          },
        }
      : { body: { removed: true } },
  );
  const renewals = await mockApi(page, '**/api/labs/trap-hooks/devices', () => ({
    body: { hookId: HOOK_ID, label: '沢の箱わな', expiresAt: EXPIRES },
  }));
  await page.goto('/labs/trap-alerts');
  await expect(page).toHaveTitle(/わな・電気柵の遠隔通知/);

  await page.getByLabel('名前（通知の見出しに表示）').fill('沢の箱わな');
  await page.getByRole('button', { name: 'URL を発行する' }).click();
  await expect(page.getByText('通知用 URL を発行しました。')).toBeVisible();
  expect(calls[0]?.body).toEqual({ subscription: FAKE_SUBSCRIPTION, language: 'ja', label: '沢の箱わな' });
  const url = `http://127.0.0.1:3001/api/labs/hooks/${TRIGGER}`;
  await expect(page.getByLabel('沢の箱わな の URL')).toHaveValue(url);
  await expect(page.getByText(`-d '{"message":"test"}' ${url}`)).toBeVisible();

  // A later visit renews the hook and this device with the manage token.
  await page.reload();
  await expect.poll(() => renewals.at(-1)?.body).toMatchObject({ hookId: HOOK_ID, manageToken: MANAGE });

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: '削除' }).click();
  await expect(page.getByText('通知用 URL を削除しました。')).toBeVisible();
  expect(calls.at(-1)).toMatchObject({ method: 'DELETE', body: { hookId: HOOK_ID, manageToken: MANAGE } });
  await expect(page.getByLabel('沢の箱わな の URL')).toHaveCount(0);
});

test('adds this device from a manage link, and refuses the trigger URL in its place', async ({ page }) => {
  const calls = await mockApi(page, '**/api/labs/trap-hooks/devices', () => ({
    body: { hookId: HOOK_ID, label: '柵', expiresAt: EXPIRES },
  }));
  await page.goto('/labs/trap-alerts');
  const field = page.getByLabel('管理用リンクをこの端末で開くか、貼り付けます。');
  await field.fill(`http://127.0.0.1:3001/api/labs/hooks/${TRIGGER}`);
  await page.getByRole('button', { name: 'この端末を追加' }).click();
  await expect(page.getByText('管理用リンクを貼り付けてください。')).toBeVisible();

  await field.fill(`http://127.0.0.1:3001/labs/trap-alerts#manage=${HOOK_ID}.${MANAGE}.${TRIGGER}`);
  await page.getByRole('button', { name: 'この端末を追加' }).click();
  await expect(page.getByText('この端末にも通知が届くようにしました。')).toBeVisible();
  expect(calls[0]?.body).toMatchObject({ hookId: HOOK_ID, manageToken: MANAGE, subscription: FAKE_SUBSCRIPTION });
});
