// SPDX-License-Identifier: MIT
import { expect, test } from "@playwright/test";

test("shows pending confirmation and stale API observations while manual posting remains stopped", async ({
  page,
  request,
}) => {
  expect((await request.post("/__test/reset")).status()).toBe(200);
  expect(
    (await request.post("/fixture/seed", { data: { count: 1 } })).status(),
  ).toBe(200);
  expect(
    (await request.post("/fixture/pending-post", { data: {} })).status(),
  ).toBe(200);
  await page.goto("/");
  await page.getByRole("button", { name: "収集元と設定", exact: true }).click();
  const status = page.locator("#posting-status");
  await expect(status).toContainText("停止中");
  await expect(status).toContainText("受け付け済み投稿を読み取り確認中");
  await expect(status).toContainText("古い観測");
  await expect(status).toContainText("観測時の残り 25/100 回");
  await expect(status).toContainText("チャンネル投稿枠（API 回数とは別）");
  await expect(status).toContainText(
    "リセット見込みは投稿再開の保証ではありません",
  );
  await expect(
    page.getByLabel("自動投稿を有効にする", { exact: true }),
  ).not.toBeChecked();
  const state = await request.get("/api/state");
  const body = (await state.json()) as {
    settings: { autoPost: boolean };
    publication: { quota: unknown };
  };
  expect(body.settings.autoPost).toBe(false);
  expect(body.publication.quota).toBeTruthy();
  expect(JSON.stringify(body.publication.quota)).not.toContain("secret");
});
