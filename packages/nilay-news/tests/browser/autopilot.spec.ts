// SPDX-License-Identifier: MIT
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  expect((await request.post("/__test/reset")).ok()).toBe(true);
  expect(
    (await request.post("/fixture/seed", { data: { count: 12 } })).ok(),
  ).toBe(true);
});

test("navigation groups automated outcomes and shows eligibility without a send promise", async ({
  page,
  request,
}) => {
  expect((await request.post("/fixture/autopilot")).ok()).toBe(true);
  await page.goto("/");
  await expect(page.locator("#page-title")).toHaveText("自動投稿の対象");
  await expect(page.locator(".article-row")).toHaveCount(3);
  await expect(page.locator(".nav-section-label")).toHaveText([
    "記事",
    "自動で止めた記事",
    "手動で分けた記事",
    "その他",
  ]);
  await expect(
    page.locator("#navigation .nav-item > span:first-child"),
  ).toHaveText([
    "自動投稿の対象",
    "投稿済み",
    "判断保留",
    "重複で停止",
    "対象外（自動）",
    "保存済み",
    "投稿承認済み",
    "見送り",
    "すべての新着",
    "未判定・仕分け失敗",
    "日時未確認",
    "期間を過ぎた記事",
  ]);
  await expect(page.locator("#navigation .nav-count-emphasis")).toHaveCount(1);
  await expect(page.locator("#page-description")).toHaveText(
    "自動投稿は停止中です。設定で有効にするまで送信されません。",
  );
  await expect(page.locator(".article-outcome")).toHaveText([
    "自動投稿の対象",
    "自動投稿の対象",
    "自動投稿の対象",
  ]);
  await page.getByRole("button", { name: /^重複で停止 / }).click();
  await expect(page.locator(".article-outcome")).toHaveText([
    "止めた：『Article 0009 クマの出没と対策』と重複（相手は投稿済み）",
    "止めた：重複（参照先なし）",
    "止めた：『Article 0010 クマの出没と対策』と重複（相手は未投稿）",
  ]);
  await expect(
    page.locator(".article-select").first(),
  ).toHaveAccessibleDescription(
    "止めた：『Article 0009 クマの出没と対策』と重複（相手は投稿済み）",
  );
  await page.locator(".article-select").first().click();
  await expect(
    page.getByRole("button", {
      name: "重複確認を省いて投稿対象にする",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("#detail-panel")).toContainText(
    "自動投稿が停止中なら送信されません",
  );
  await page
    .getByRole("button", {
      name: "↗ Article 0009 クマの出没と対策",
      exact: true,
    })
    .click();
  await expect(page.locator("#page-title")).toHaveText("投稿済み");
  await expect(page.locator(".detail-title")).toHaveText(
    "Article 0009 クマの出没と対策",
  );
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: "すべて解除", exact: true }).click();
  await page.getByRole("button", { name: /^判断保留 / }).click();
  await expect(page.locator(".article-outcome")).toHaveText([
    "保留：重複か判断できず（相手：『Article 0000 クマの出没と対策』）",
    "保留：対象か判断できず",
  ]);
  await page.locator(".article-select").first().click();
  await page
    .getByRole("button", {
      name: "↗ Article 0000 クマの出没と対策",
      exact: true,
    })
    .click();
  await expect(page.locator("#page-title")).toHaveText("自動投稿の対象");
  await expect(page.locator(".detail-title")).toHaveText(
    "Article 0000 クマの出没と対策",
  );
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: "すべて解除", exact: true }).click();
  await page.getByRole("button", { name: /^対象外（自動） / }).click();
  await expect(page.locator(".article-outcome")).toHaveText(
    "対象外：対象外の可能性が高い（確度低）：選定基準で対象外とされる話題",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("row dismissal retries failure, blocks repeated requests and restores focus after removal", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#article-list")).toContainText(
    "自動投稿の対象はありません",
  );
  await page.getByRole("button", { name: /^すべての新着 / }).click();
  const dismiss = page.getByRole("button", {
    name: "Article 0000 クマの出没と対策 — 見送る",
    exact: true,
  });
  let calls = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/articles/*/review", async (route) => {
    calls++;
    if (calls === 1)
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Dismiss retry" }),
      });
    else {
      await held;
      await route.continue();
    }
  });
  await dismiss.click();
  await expect(page.locator("#notice-text")).toHaveText("Dismiss retry");
  await expect(dismiss).toBeFocused();
  await expect(page.locator(".article-row")).toHaveCount(12);
  await dismiss.click();
  await expect(dismiss).toBeDisabled();
  await dismiss.evaluate((node) => {
    (node as HTMLButtonElement).click();
    (node as HTMLButtonElement).click();
  });
  expect(calls).toBe(2);
  release();
  await expect(page.locator("#notice-text")).toHaveText(
    "この記事を見送りました。",
  );
  await expect(page.locator(".article-row")).toHaveCount(11);
  await expect(
    page.getByRole("button", {
      name: "Article 0001 クマの出没と対策 — 詳細を読む",
      exact: true,
    }),
  ).toBeFocused();
  expect(await page.locator(".article-select button").count()).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator("#search").fill("Article 0001");
  await expect(page.locator(".article-row")).toHaveCount(1);
  await page
    .getByRole("button", {
      name: "Article 0001 クマの出没と対策 — 見送る",
      exact: true,
    })
    .click();
  await expect(page.locator(".article-row")).toHaveCount(0);
  await expect(page.locator("#page-title")).toBeFocused();
});

test("the eligible view reports an unresolved post independently of the posting switch", async ({
  page,
  request,
}) => {
  expect((await request.post("/fixture/pending-post")).ok()).toBe(true);
  await page.goto("/");
  await expect(page.locator("#page-description")).toHaveText(
    "自動投稿は停止中です。設定で有効にするまで送信されません。未解決の投稿があるため、新しい送信は止まっています。",
  );
});

test.describe("enabled posting explanation", () => {
  test.use({ timezoneId: "America/Los_Angeles" });
  for (const [nextAt, expected] of [
    [
      Date.UTC(2026, 10, 12, 7, 5) / 1000,
      "自動投稿は有効です。次回の送信は 16:05 以降です。",
    ],
    [0, "自動投稿は有効です。"],
  ] as const) {
    test(`uses a short JST explanation with nextAt=${nextAt}`, async ({
      page,
    }) => {
      // Only presentation fixtures change; no settings API is called.
      for (const pattern of ["**/api/state", "**/api/articles?*"])
        await page.route(pattern, async (route) => {
          const response = await route.fetch();
          const state = await response.json();
          if (state.settings) state.settings.autoPost = true;
          state.publication = { ...state.publication, nextAt, posts: [] };
          await route.fulfill({ response, json: state });
        });
      await page.goto("/");
      await expect(page.locator("#page-description")).toHaveText(expected);
    });
  }
});
