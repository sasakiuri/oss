// SPDX-License-Identifier: MIT
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  expect((await request.post("/__test/reset")).ok()).toBe(true);
  expect(
    (await request.post("/fixture/seed", { data: { count: 12 } })).ok(),
  ).toBe(true);
});

test("filter controls expose the active conditions and each condition can be removed", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".article-row")).toHaveCount(12);
  const toggle = page.getByRole("button", { name: "絞り込み", exact: true });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#filter-panel")).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page
    .getByRole("combobox", { name: "仕分け結果", exact: true })
    .selectOption("candidate");
  await expect(page.locator("#article-list")).toContainText(
    "条件に合う記事はありません",
  );
  await expect(page.locator("#filter-count")).toHaveText("1");
  await page.getByRole("button", { name: "候補を解除", exact: true }).click();
  await expect(page.locator(".article-row")).toHaveCount(12);
  await expect(page.locator("#filter-count")).toBeHidden();
  await expect(page.locator("#active-filters")).toBeHidden();
  await expect(page.locator("#search")).toBeFocused();
  await page
    .getByRole("combobox", { name: "重複・関連性", exact: true })
    .selectOption("none");
  await page.locator("#search").fill("Article 0001");
  await expect(page.locator(".article-row")).toHaveCount(1);
  await expect(page.locator("#active-filters .filter-chip")).toHaveCount(2);
  await page.getByRole("button", { name: "すべて解除", exact: true }).click();
  await expect(page.locator(".article-row")).toHaveCount(12);
  await expect(
    page.getByRole("combobox", { name: "重複・関連性", exact: true }),
  ).toHaveValue("");
});

test("empty folders explain their purpose and bulk selection can be cleared", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".article-row")).toHaveCount(12);
  await page.getByRole("button", { name: /^保存済み 0$/ }).click();
  await expect(page.locator("#article-list")).toContainText(
    "保存した記事はありません",
  );
  await expect(page.locator("#article-list")).not.toContainText(
    "記事はまだありません",
  );
  await page.getByRole("button", { name: /^受信箱 12$/ }).click();
  await expect(page.locator("#page-title")).toHaveText("受信箱");
  await expect(page.locator(".article-row")).toHaveCount(12);
  await page.locator("#select-all-articles").check();
  await expect(page.locator("#selection-tools")).toBeVisible();
  await expect(page.locator("#selection-count")).toHaveText("12 件選択中");
  await page.getByRole("button", { name: "選択を解除", exact: true }).click();
  await expect(page.locator("#selection-tools")).toBeHidden();
  await expect(page.locator("#select-all-articles")).toBeFocused();
  await expect(page.locator("#article-list input:checked")).toHaveCount(0);
});

test("search waits for typing to settle and shortcuts preserve a clear focus target", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  await expect(page.locator(".article-row")).toHaveCount(12);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/articles")
      requests.push(request.url());
  });
  await page.locator("#main").focus();
  await page.keyboard.press("/");
  await expect(page.locator("#search")).toBeFocused();
  for (const value of ["A", "Article", "Article 0001"]) {
    await page.locator("#search").fill(value);
    await page.clock.runFor(100);
  }
  expect(requests).toHaveLength(0);
  await page.clock.runFor(250);
  await expect(page.locator(".article-row")).toHaveCount(1);
  expect(requests).toHaveLength(1);
  await page.locator(".article-select").click();
  await expect(page.locator("#detail-panel")).toContainText("Fixture body 1");
  await page.locator("#detail-panel").focus();
  await page.keyboard.press("Escape");
  await expect(page.locator(".article-select")).toBeFocused();
  await expect(page.locator("#reading-workspace")).not.toHaveClass(
    /has-selection/,
  );
});

test("failed initial article requests offer an explicit retry", async ({
  page,
}) => {
  let failed = false;
  await page.route("**/api/articles?*", async (route) => {
    if (!failed) {
      failed = true;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary article failure" }),
      });
    } else await route.continue();
  });
  await page.goto("/");
  await expect(page.locator("#article-list")).toContainText(
    "記事を読み込めませんでした",
  );
  await expect(page.locator("#article-list")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await page
    .getByRole("button", { name: "もう一度読み込む", exact: true })
    .click();
  await expect(page.locator(".article-row")).toHaveCount(12);
  await expect(page.locator("#notice")).toBeHidden();
});

test("workspace, filters, selection and settings fit narrow viewports without duplicate IDs", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto("/");
  await expect(page.locator(".article-row")).toHaveCount(12);
  await page.locator("#filter-toggle").click();
  await page.locator("#select-all-articles").check();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "収集元と設定", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "投稿設定を保存", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const duplicates = await page.evaluate(() => {
    const ids = [...document.querySelectorAll("[id]")].map((node) => node.id);
    return ids.filter((id, index) => ids.indexOf(id) !== index);
  });
  expect(duplicates).toEqual([]);
});

test("an unchanged background refresh finishes an overlapping visible load", async ({
  page,
  request,
}) => {
  expect(
    (await request.post("/fixture/seed", { data: { count: 151 } })).ok(),
  ).toBe(true);
  await page.goto("/");
  await expect(page.locator(".article-row")).toHaveCount(50);
  let release!: () => void;
  let captured!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    captured = resolve;
  });
  let first = true;
  await page.route("**/api/articles?*", async (route) => {
    if (first) {
      first = false;
      captured();
      await held;
    }
    await route.continue();
  });
  // A whitespace-only edit has the same server result as the displayed list.
  await page.locator("#search").fill(" ");
  await started;
  await expect(page.locator("#article-list")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  const refreshed = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/articles",
  );
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await (await refreshed).finished();
  await expect(page.locator("#article-list")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(
    page.getByRole("button", { name: "次のページ", exact: true }),
  ).toBeVisible();
  const obsolete = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/articles",
  );
  release();
  await (await obsolete).finished();
  await expect(page.locator("#list-range")).toHaveText("1–50 / 151 件");
});

test("background recovery clears an obsolete list error even when the results are unchanged", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".article-row")).toHaveCount(12);
  await page.locator("#search").fill("NO_MATCH");
  await expect(page.locator("#article-list")).toContainText(
    "条件に合う記事はありません",
  );
  let fail = true;
  await page.route("**/api/articles?*", async (route) => {
    if (fail) {
      fail = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary article failure" }),
      });
    } else await route.continue();
  });
  await page.locator("#search").fill("NO_MATCH ");
  await expect(page.locator("#article-list")).toContainText(
    "記事を読み込めませんでした",
  );
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(page.locator("#article-list")).toContainText(
    "条件に合う記事はありません",
  );
  await expect(
    page.getByRole("button", { name: "もう一度読み込む", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("#notice")).toBeHidden();
});

test("Japanese text composition does not send intermediate search requests", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  await expect(page.locator(".article-row")).toHaveCount(12);
  const queries: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/articles")
      queries.push(url.searchParams.get("query") || "");
  });
  await page.locator("#search").evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = "ク";
    input.dispatchEvent(
      new InputEvent("input", { bubbles: true, isComposing: true }),
    );
  });
  await page.clock.runFor(500);
  expect(queries).toEqual([]);
  await page.locator("#search").evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = "クマ";
    input.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true }),
    );
  });
  await page.clock.runFor(300);
  await expect(page.locator("#active-filters")).toContainText("検索: クマ");
  expect(queries).toEqual(["クマ"]);
});
