// SPDX-License-Identifier: MIT
import { expect, test, type Page } from "@playwright/test";

async function settings(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "収集元と設定", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "投稿設定を保存", exact: true }),
  ).toBeVisible();
}
async function snapshot(page: Page) {
  const response = await page.request.get("/api/state");
  expect(response.status()).toBe(200);
  return response.json() as Promise<{
    settings: {
      revision: string;
      autoPost: boolean;
      rubric: string;
      pollMinutes: number;
      postSelection: string;
    };
  }>;
}

test.beforeEach(async ({ request }) => {
  expect((await request.post("/__test/reset")).status()).toBe(200);
});

test("two tabs cannot silently re-enable posting, and changed fields exclude unchanged toggles", async ({
  page,
  context,
}) => {
  const original = await snapshot(page);
  expect(
    (
      await page.request.post("/api/settings", {
        data: { revision: original.settings.revision, autoPost: true },
      })
    ).status(),
  ).toBe(200);
  await settings(page);
  const second = await context.newPage();
  await settings(second);
  await second.getByLabel("自動投稿を有効にする", { exact: true }).uncheck();
  await second
    .getByRole("button", { name: "投稿設定を保存", exact: true })
    .click();
  await expect(second.locator("#notice-text")).toHaveText(
    "投稿設定を保存しました。",
  );
  await page.locator("#post-selection").selectOption("saved");
  const sent = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/settings") && request.method() === "POST",
  );
  const rejected = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/settings") && response.status() === 409,
  );
  await page
    .getByRole("button", { name: "投稿設定を保存", exact: true })
    .click();
  const body: unknown = (await sent).postDataJSON();
  expect(body).toEqual({
    revision: expect.any(String),
    postSelection: "saved",
  });
  await rejected;
  await expect(page.locator("#settings-conflict")).toBeVisible();
  await expect(page.locator("#post-selection")).toHaveValue("saved");
  await expect(
    page.getByLabel("自動投稿を有効にする", { exact: true }),
  ).toBeChecked();
  expect((await snapshot(page)).settings).toMatchObject({
    autoPost: false,
    postSelection: "both",
  });
  await page
    .getByRole("button", { name: "最新の設定を読み直す（未保存の変更を破棄）" })
    .click();
  await expect(
    page.getByLabel("自動投稿を有効にする", { exact: true }),
  ).not.toBeChecked();
  await expect(page.locator("#post-selection")).toHaveValue("both");
  // A new explicit toggle after reading the stopped state is required to restart.
  await page.getByLabel("自動投稿を有効にする", { exact: true }).check();
  await page
    .getByRole("button", { name: "投稿設定を保存", exact: true })
    .click();
  await expect(page.locator("#notice-text")).toHaveText(
    "投稿設定を保存しました。",
  );
  expect((await snapshot(page)).settings.autoPost).toBe(true);
});

test("an interval-only edit cannot overwrite another tab's newer rubric and preserves the draft", async ({
  page,
  context,
}) => {
  await settings(page);
  const second = await context.newPage();
  await settings(second);
  const newer = "A newer selection rubric reviewed in the other tab";
  await second.locator("#rubric-input").fill(newer);
  await second.getByRole("button", { name: "設定を保存", exact: true }).click();
  await expect(second.locator("#notice-text")).toHaveText(
    "設定を保存しました。",
  );
  const oldRubric = await page.locator("#rubric-input").inputValue();
  await page.locator("#poll-input").fill("30");
  const sent = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/settings") && request.method() === "POST",
  );
  await page.getByRole("button", { name: "設定を保存", exact: true }).click();
  expect((await sent).postDataJSON()).toEqual({
    revision: expect.any(String),
    pollMinutes: 30,
  });
  await expect(page.locator("#settings-conflict")).toBeVisible();
  await expect(page.locator("#poll-input")).toHaveValue("30");
  await expect(page.locator("#rubric-input")).toHaveValue(oldRubric);
  expect((await snapshot(page)).settings).toMatchObject({
    rubric: newer,
    pollMinutes: 60,
  });
});

test("automatic safety stops invalidate an open posting form", async ({
  page,
}) => {
  expect(
    (await page.request.post("/fixture/seed", { data: { count: 1 } })).status(),
  ).toBe(200);
  const original = await snapshot(page);
  expect(
    (
      await page.request.post("/api/settings", {
        data: { revision: original.settings.revision, autoPost: true },
      })
    ).status(),
  ).toBe(200);
  await settings(page);
  expect(
    (await page.request.post("/fixture/safety-stop", { data: {} })).status(),
  ).toBe(200);
  await page.locator("#post-selection").selectOption("saved");
  await page
    .getByRole("button", { name: "投稿設定を保存", exact: true })
    .click();
  await expect(page.locator("#settings-conflict")).toBeVisible();
  expect((await snapshot(page)).settings.autoPost).toBe(false);
});
