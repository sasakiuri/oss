import type { Page } from '@playwright/test';

import { test, expect } from './fixtures';
import { FAKE_SUBSCRIPTION, mockApi, stubPush, VAPID_KEY } from './labs-push';

const PLAN_ID = 'p'.repeat(22);
const OWNER = 'o'.repeat(43);
const WATCH = 'w'.repeat(43);
const plan = (status = 'before', watchers = 0) => ({
  returnAt: '2026-11-15T08:00:00.000Z',
  graceMinutes: 30,
  note: '北尾根',
  watchers,
  status,
});

// Anchored at the end, so the creation, arming and the other actions never catch each other's requests.
const CREATE_URL = /\/api\/labs\/return-plans$/;
const ARM_URL = /\/api\/labs\/return-plans\/arm$/;
const ACTION_URL = /\/api\/labs\/return-plans\/(return|cancel|update|status)$/;
const createdPlan = () => ({
  status: 201,
  body: { planId: PLAN_ID, ownerToken: OWNER, watchToken: WATCH, plan: plan() },
});

test.use({ timezoneId: 'Asia/Tokyo' });

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-15T08:00:00+09:00') });
  await stubPush(page);
  await mockApi(page, '**/api/labs/push/key', () => ({ body: VAPID_KEY }));
});

test('registers a plan from another tool’s values, shares the watch link and reports the return', async ({ page }) => {
  const created = await mockApi(page, CREATE_URL, createdPlan);
  const actions = await mockApi(page, ACTION_URL, () => ({ body: { done: true } }));
  const arms = await mockApi(page, ARM_URL, () => ({ body: { plan: plan() } }));

  await page.goto('/labs/return-alert?returnAt=2026-11-15T17:00&note=%E5%8C%97%E5%B0%BE%E6%A0%B9');
  await expect(page).toHaveTitle(/帰着予定の見守り/);
  await expect(page.getByLabel('帰着予定', { exact: true })).toHaveValue('2026-11-15T17:00');
  await expect(page.getByLabel('行き先・経路のメモ（任意）')).toHaveValue('北尾根');
  await page.getByLabel('見守りの人に知らせるまでの猶予').selectOption('30');
  await page.getByRole('button', { name: '登録して見守り用リンクを作る' }).click();

  await expect(page.getByText('入山計画を登録しました。')).toBeVisible();
  expect(created[0]?.body).toEqual({
    subscription: FAKE_SUBSCRIPTION,
    language: 'ja',
    returnAt: '2026-11-15T08:00:00.000Z',
    graceMinutes: 30,
    note: '北尾根',
  });
  // The keys are saved, then the plan is armed with the owner key, once.
  expect(created).toHaveLength(1);
  expect(arms.map((call) => call.body)).toEqual([{ planId: PLAN_ID, token: OWNER }]);
  await expect(page.getByLabel(/見守り用リンク/)).toHaveValue(
    `http://127.0.0.1:3001/labs/return-alert#watch=${PLAN_ID}.${WATCH}`,
  );

  await page.reload();
  await page.getByRole('button', { name: '帰着した' }).click();
  await expect(page.getByText('おかえりなさい。見守りの人に帰着を知らせました。')).toBeVisible();
  expect(actions.at(-1)?.body).toEqual({ planId: PLAN_ID, token: OWNER });
  await expect(page.getByRole('button', { name: '登録して見守り用リンクを作る' })).toBeVisible();
});

test('arms the saved plan again after a reload when the answer to arming was lost', async ({ page }) => {
  const created = await mockApi(page, CREATE_URL, createdPlan);
  const arms: unknown[] = [];
  await page.route(ARM_URL, async (route) => {
    arms.push(route.request().postDataJSON());
    // The first answer never arrives; the plan was armed all the same.
    if (arms.length === 1) {
      await route.abort('connectionreset');
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ plan: plan() }) });
  });

  await page.goto('/labs/return-alert');
  await page.getByLabel('帰着予定', { exact: true }).fill('2026-11-15T17:00');
  await page.getByRole('button', { name: '登録して見守り用リンクを作る' }).click();
  await expect(page.getByText('通信できませんでした。電波の状況を確認してください。')).toBeVisible();
  // Until arming is confirmed the plan is shown as not registered, with no link to share.
  await expect(page.getByText('未登録', { exact: true })).toBeVisible();
  await expect(page.getByLabel(/見守り用リンク/)).toHaveCount(0);

  await page.reload();
  // Arming is repeated with the saved keys; no second plan is made.
  await expect(page.getByText('入山計画を登録しました。')).toBeVisible();
  expect(created).toHaveLength(1);
  expect(arms).toEqual([
    { planId: PLAN_ID, token: OWNER },
    { planId: PLAN_ID, token: OWNER },
  ]);
  await expect(page.getByLabel(/見守り用リンク/)).toHaveValue(
    `http://127.0.0.1:3001/labs/return-alert#watch=${PLAN_ID}.${WATCH}`,
  );
});

test('finishes registering on request after arming failed, without a reload', async ({ page }) => {
  await mockApi(page, CREATE_URL, createdPlan);
  const arms = await mockApi(page, ARM_URL, () =>
    arms.length === 1 ? { status: 503, body: { error: 'unavailable' } } : { body: { plan: plan() } },
  );

  await page.goto('/labs/return-alert');
  await page.getByLabel('帰着予定', { exact: true }).fill('2026-11-15T17:00');
  await page.getByRole('button', { name: '登録して見守り用リンクを作る' }).click();
  await expect(page.getByText('未登録', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '帰着した' })).toHaveCount(0);

  await page.getByRole('button', { name: '登録を完了する' }).click();
  await expect(page.getByText('入山計画を登録しました。')).toBeVisible();
  expect(arms).toHaveLength(2);
  await expect(page.getByRole('button', { name: '帰着した' })).toBeVisible();
});

test('does not arm a plan whose keys this browser could not keep', async ({ page }) => {
  // The storage refuses every write of this tool's saved values, as a full or private storage does.
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'nilay-labs-return-alert-v1') throw new DOMException('full', 'QuotaExceededError');
      setItem.call(this, key, value);
    };
  });
  await mockApi(page, CREATE_URL, createdPlan);
  const arms = await mockApi(page, ARM_URL, () => ({ body: { plan: plan() } }));

  await page.goto('/labs/return-alert');
  await page.getByLabel('帰着予定', { exact: true }).fill('2026-11-15T17:00');
  await page.getByRole('button', { name: '登録して見守り用リンクを作る' }).click();
  await expect(page.getByText(/計画の鍵を保存できなかったため、登録を完了していません。/)).toBeVisible();
  expect(arms).toHaveLength(0);
  await expect(page.getByRole('button', { name: '登録して見守り用リンクを作る' })).toBeVisible();
});

test('asks for a new plan when the return time passed before arming', async ({ page }) => {
  await mockApi(page, CREATE_URL, createdPlan);
  await mockApi(page, ARM_URL, () => ({ status: 410, body: { error: 'gone' } }));

  await page.goto('/labs/return-alert');
  await page.getByLabel('帰着予定', { exact: true }).fill('2026-11-15T17:00');
  await page.getByRole('button', { name: '登録して見守り用リンクを作る' }).click();
  await expect(page.getByText(/帰着予定を過ぎたため、登録を完了できませんでした。/)).toBeVisible();
  await expect(page.getByRole('button', { name: '登録して見守り用リンクを作る' })).toBeVisible();
});

test('lets a companion watch a plan from the link', async ({ page }) => {
  const calls = await mockApi(page, '**/api/labs/return-plans/watch', () => ({ body: { plan: plan('before', 1) } }));
  await page.goto(`/labs/return-alert#watch=${PLAN_ID}.${WATCH}`);
  await page.getByRole('button', { name: 'この計画を見守る' }).click();
  await expect(page.getByText('見守りを登録しました。')).toBeVisible();
  expect(calls[0]?.body).toMatchObject({ planId: PLAN_ID, token: WATCH, subscription: FAKE_SUBSCRIPTION });
  await expect(page.getByText('帰着予定 11/15 17:00')).toBeVisible();
  // The token leaves the address once it is saved.
  expect(new URL(page.url()).hash).toBe('');
});

test('makes one plan for a double click', async ({ page }) => {
  const created = await mockApi(page, CREATE_URL, createdPlan);
  const arms = await mockApi(page, ARM_URL, () => ({ body: { plan: plan() } }));

  await page.goto('/labs/return-alert');
  await page.getByLabel('帰着予定', { exact: true }).fill('2026-11-15T17:00');
  await page.getByRole('button', { name: '登録して見守り用リンクを作る' }).dblclick();
  await expect(page.getByText('入山計画を登録しました。')).toBeVisible();
  expect(created).toHaveLength(1);
  expect(arms).toHaveLength(1);
});

test('shows another tab the plan as soon as it is saved, so no second plan is made there', async ({
  page,
  context,
}) => {
  const created = await mockApi(page, CREATE_URL, createdPlan);
  await mockApi(page, ARM_URL, () => ({ body: { plan: plan() } }));
  const other = await context.newPage();
  await other.clock.install({ time: new Date('2026-11-15T08:00:00+09:00') });
  await stubPush(other);
  await mockApi(other, '**/api/labs/push/key', () => ({ body: VAPID_KEY }));
  const otherCreated = await mockApi(other, CREATE_URL, createdPlan);

  // The other tab is open on the form before the plan is made.
  await other.goto('/labs/return-alert');
  await expect(other.getByRole('button', { name: '登録して見守り用リンクを作る' })).toBeVisible();
  await page.goto('/labs/return-alert');
  await page.getByLabel('帰着予定', { exact: true }).fill('2026-11-15T17:00');
  await page.getByRole('button', { name: '登録して見守り用リンクを作る' }).click();
  await expect(page.getByText('入山計画を登録しました。')).toBeVisible();

  // It takes in the saved plan: the form gives way to the plan, and nothing is created there.
  await expect(other.getByRole('button', { name: '帰着した' })).toBeVisible();
  await expect(other.getByRole('button', { name: '登録して見守り用リンクを作る' })).toHaveCount(0);
  expect(created).toHaveLength(1);
  expect(otherCreated).toHaveLength(0);
});

test('keeps the plan’s keys when a tab opened earlier saves a watch of its own', async ({ page, context }) => {
  await mockApi(page, CREATE_URL, createdPlan);
  await mockApi(page, ARM_URL, () => ({ body: { plan: plan() } }));
  const other = await context.newPage();
  await other.clock.install({ time: new Date('2026-11-15T08:00:00+09:00') });
  await stubPush(other);
  await mockApi(other, '**/api/labs/push/key', () => ({ body: VAPID_KEY }));
  const OTHER_PLAN = 'q'.repeat(22);
  await mockApi(other, '**/api/labs/return-plans/watch', () => ({ body: { plan: plan('before', 1) } }));

  // The other tab opens a watch link before this tab makes its plan.
  await other.goto(`/labs/return-alert#watch=${OTHER_PLAN}.${WATCH}`);
  await page.goto('/labs/return-alert');
  await page.getByLabel('帰着予定', { exact: true }).fill('2026-11-15T17:00');
  await page.getByRole('button', { name: '登録して見守り用リンクを作る' }).click();
  await expect(page.getByText('入山計画を登録しました。')).toBeVisible();

  await other.getByRole('button', { name: 'この計画を見守る' }).click();
  await expect(other.getByText('見守りを登録しました。')).toBeVisible();
  // The other tab took in the plan as it was saved, and its own save kept it.
  await expect(other.getByRole('button', { name: '帰着した' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: '帰着した' })).toBeVisible();
  const saved = await page.evaluate(() => window.localStorage.getItem('nilay-labs-return-alert-v1'));
  expect(saved).toContain(OWNER);
  expect(saved).toContain(OTHER_PLAN);
});

/** Leaves the note of a restore cut short that could not be undone, which keeps the tools read-only. */
const leaveFailedRestore = (page: Page) =>
  page.evaluate(() =>
    window.localStorage.setItem(
      'nilay-labs-restore-journal-v1',
      JSON.stringify({
        token: '11111111-1111-4111-8111-111111111111',
        phase: 'committing',
        local: [],
        photoTools: [],
        maps: false,
        failed: true,
      }),
    ),
  );

test('does not register a watch while a restore cut short keeps the tools read-only, and says why', async ({
  page,
}) => {
  const calls = await mockApi(page, '**/api/labs/return-plans/watch', () => ({ body: { plan: plan('before', 1) } }));
  await page.goto('/labs');
  await leaveFailedRestore(page);
  await page.goto(`/labs/return-alert#watch=${PLAN_ID}.${WATCH}`);
  await page.getByRole('button', { name: 'この計画を見守る' }).click();
  await expect(
    page.getByText(/途中で止まったバックアップの読み込みを解決するまで、見守りを登録しません/),
  ).toBeVisible();
  expect(calls).toHaveLength(0);
  // The link stays, to watch from once the restore is settled.
  expect(new URL(page.url()).hash).toBe(`#watch=${PLAN_ID}.${WATCH}`);
  await expect(page.getByText('見守りを登録しました。')).toHaveCount(0);
});

test('while read-only, refreshes and changes nothing it cannot save, but still reports the return', async ({
  page,
}) => {
  await mockApi(page, CREATE_URL, createdPlan);
  await mockApi(page, ARM_URL, () => ({ body: { plan: plan() } }));
  const actions = await mockApi(page, ACTION_URL, () => ({ body: { done: true } }));
  await page.goto('/labs/return-alert');
  await page.getByLabel('帰着予定', { exact: true }).fill('2026-11-15T17:00');
  await page.getByRole('button', { name: '登録して見守り用リンクを作る' }).click();
  await expect(page.getByText('入山計画を登録しました。')).toBeVisible();

  await leaveFailedRestore(page);
  await page.reload();
  await page.getByRole('button', { name: '状態を更新' }).click();
  await expect(
    page.getByText(/途中で止まったバックアップの読み込みを解決するまで、計画の状態を更新しません/),
  ).toBeVisible();
  expect(actions).toHaveLength(0);

  // Reporting the return stops the alerts to the watchers, so it is not held back; the page says the
  // device could not forget the plan.
  await page.getByRole('button', { name: '帰着した' }).click();
  await expect(page.getByText(/見守りの人に帰着を知らせました。/)).toBeVisible();
  await expect(page.getByText(/この端末には保存できないため/)).toBeVisible();
  expect(actions.map((call) => call.body)).toEqual([{ planId: PLAN_ID, token: OWNER }]);
});
