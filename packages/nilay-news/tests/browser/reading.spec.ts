// SPDX-License-Identifier: MIT
import { expect, test, type Page } from "@playwright/test";

async function openFirst(page: Page) {
  await page.goto("/");
  await expect(page.locator(".article-row")).toHaveCount(12);
  await page.locator(".article-select").first().click();
  await expect(page.locator("#detail-panel")).toContainText("Fixture body 0");
}

test.beforeEach(async ({ request }) => {
  expect((await request.post("/__test/reset")).ok()).toBe(true);
  expect(
    (await request.post("/fixture/seed", { data: { count: 12 } })).ok(),
  ).toBe(true);
});

test("articles appear near the top of the screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".article-row")).toHaveCount(12);
  const first = await page.locator(".article-row").first().boundingBox();
  expect(first).not.toBeNull();
  expect(first!.y).toBeLessThan(page.viewportSize()!.width <= 650 ? 430 : 300);
});

test("previous, next and reading shortcuts follow the displayed list", async ({
  page,
}) => {
  await openFirst(page);
  await expect(
    page.getByRole("button", { name: "前の記事", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".detail-position")).toHaveText("1 / 12");
  await page.getByRole("button", { name: "次の記事", exact: true }).click();
  await expect(page.locator("#detail-panel")).toContainText("Fixture body 1");
  await expect(page.locator(".detail-position")).toHaveText("2 / 12");
  await page.keyboard.press("k");
  await expect(page.locator("#detail-panel")).toContainText("Fixture body 0");
  await page.keyboard.press("j");
  await expect(page.locator("#detail-panel")).toContainText("Fixture body 1");
  await page.keyboard.press("/");
  await expect(page.locator("#search")).toBeFocused();
});

test("closing details returns to the article and list scroll position", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".article-row")).toHaveCount(12);
  const article = page.locator(".article-select").nth(8);
  await article.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => scrollY);
  await article.click();
  await expect(page.locator("#detail-panel")).toContainText("Fixture body 8");
  if (page.viewportSize()!.width <= 960)
    await expect(page.locator(".article-column")).toBeHidden();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(article).toBeFocused();
  await expect(page.locator(".article-column")).toBeVisible();
  expect(Math.abs((await page.evaluate(() => scrollY)) - before)).toBeLessThan(
    3,
  );
});

test("save and dismiss advance the reader after the article leaves the list", async ({
  page,
}) => {
  await openFirst(page);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator("#notice-text")).toHaveText("保存しました。");
  await expect(page.locator("#detail-panel")).toContainText("Fixture body 1");
  await expect(page.locator("#list-count")).toHaveText("11 件");
  await page
    .getByRole("button", { name: "この記事を見送る", exact: true })
    .click();
  await expect(page.locator("#detail-panel")).toContainText("Fixture body 2");
  await expect(page.locator("#list-count")).toHaveText("10 件");
  const state = await (await page.request.get("/api/state")).json();
  expect(state.stats.buckets.saved).toBe(1);
  expect(state.stats.buckets.dismissed).toBe(1);
});

for (const action of ["close", "next"] as const) {
  test(`a pending save respects the operator's ${action} action`, async ({
    page,
  }) => {
    await openFirst(page);
    let release!: () => void;
    let captured!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      captured = resolve;
    });
    await page.route("**/api/articles/*/review", async (route) => {
      captured();
      await held;
      await route.continue();
    });
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await started;
    await expect(
      page.getByRole("button", { name: "保存", exact: true }),
    ).toBeDisabled();
    if (action === "close")
      await page.getByRole("button", { name: "閉じる", exact: true }).click();
    else {
      await page.getByRole("button", { name: "次の記事", exact: true }).click();
      await expect(page.locator("#detail-panel")).toContainText(
        "Fixture body 1",
      );
    }
    release();
    await expect(page.locator("#list-count")).toHaveText("11 件");
    if (action === "close")
      await expect(page.locator("#reading-workspace")).not.toHaveClass(
        /has-selection/,
      );
    else
      await expect(page.locator("#detail-panel")).toContainText(
        "Fixture body 1",
      );
  });
}

test("a changed background refresh preserves the expanded body and reading position", async ({
  page,
}) => {
  await page.clock.install();
  await openFirst(page);
  const body = page.locator(".article-body");
  const summary = body.locator("summary");
  await summary.click();
  await expect(body).toHaveAttribute("open", "");
  await summary.focus();
  const before = await page.evaluate(() => {
    const panel = document.getElementById("detail-panel")!;
    if (matchMedia("(max-width: 960px)").matches) {
      scrollTo(0, 550);
      return scrollY;
    }
    panel.scrollTop = 400;
    return panel.scrollTop;
  });
  expect(
    (await page.request.post("/fixture/seed", { data: { count: 13 } })).ok(),
  ).toBe(true);
  const detail = page.waitForResponse((response) =>
    /\/api\/articles\/[^/?]+$/.test(new URL(response.url()).pathname),
  );
  await page.clock.fastForward(30_001);
  await (await detail).finished();
  await page.clock.runFor(100);
  await expect(page.locator("#list-count")).toHaveText("13 件");
  await expect(body).toHaveAttribute("open", "");
  await expect(summary).toBeFocused();
  const after = await page.evaluate(() =>
    matchMedia("(max-width: 960px)").matches
      ? scrollY
      : document.getElementById("detail-panel")!.scrollTop,
  );
  expect(Math.abs(after - before)).toBeLessThan(3);
});

test("processing the final article returns to an actionable empty list", async ({
  page,
  request,
}) => {
  expect((await request.post("/__test/reset")).ok()).toBe(true);
  expect(
    (await request.post("/fixture/seed", { data: { count: 1 } })).ok(),
  ).toBe(true);
  await page.goto("/");
  await expect(page.locator(".article-row")).toHaveCount(1);
  await page.locator(".article-select").click();
  await expect(page.locator("#detail-panel")).toContainText("Fixture body 0");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator("#article-list")).toContainText(
    "未読の記事はありません",
  );
  await expect(page.locator("#reading-workspace")).not.toHaveClass(
    /has-selection/,
  );
  await expect(page.locator("#page-title")).toBeFocused();
});

test("a failed keyboard save keeps the article and restores the retry target", async ({
  page,
}) => {
  await openFirst(page);
  await page.route("**/api/articles/*/review", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Temporary save failure" }),
    });
  });
  const save = page.getByRole("button", { name: "保存", exact: true });
  await save.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#notice-text")).toHaveText(
    "Temporary save failure",
  );
  await expect(save).toBeEnabled();
  await expect(save).toBeFocused();
  await expect(page.locator("#detail-panel")).toContainText("Fixture body 0");
});

test("reader navigation crosses page boundaries in both directions", async ({
  page,
  request,
}) => {
  expect(
    (await request.post("/fixture/seed", { data: { count: 51 } })).ok(),
  ).toBe(true);
  await page.goto("/");
  await expect(page.locator(".article-row")).toHaveCount(50);
  await page.locator(".article-select").nth(49).click();
  await expect(page.locator("#detail-panel")).toContainText("Fixture body 49");
  await expect(page.locator(".detail-position")).toHaveText("50 / 51");
  await page.getByRole("button", { name: "次の記事", exact: true }).click();
  await expect(page.locator("#detail-panel")).toContainText("Fixture body 50");
  await expect(page.locator(".detail-position")).toHaveText("51 / 51");
  await expect(
    page.getByRole("button", { name: "次の記事", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "前の記事", exact: true }).click();
  await expect(page.locator("#detail-panel")).toContainText("Fixture body 49");
  await expect(page.locator(".detail-position")).toHaveText("50 / 51");
});

test("removing a one-article final page keeps the reader at the adjacent article", async ({
  page,
  request,
}) => {
  expect(
    (await request.post("/fixture/seed", { data: { count: 51 } })).ok(),
  ).toBe(true);
  await page.goto("/");
  await expect(page.locator(".article-row")).toHaveCount(50);
  await page.getByRole("button", { name: "次のページ", exact: true }).click();
  await expect(page.locator(".article-row")).toHaveCount(1);
  await page.locator(".article-select").click();
  await expect(page.locator("#detail-panel")).toContainText("Fixture body 50");
  await page
    .getByRole("button", { name: "この記事を見送る", exact: true })
    .click();
  await expect(page.locator("#detail-panel")).toContainText("Fixture body 49");
  await expect(page.locator(".detail-position")).toHaveText("50 / 50");
});

test("settings retain the list navigation after resizing a selected desktop reader", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openFirst(page);
  await page.getByRole("button", { name: "収集元と設定", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "投稿設定を保存", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /^受信箱 12$/ }).click();
  await expect(page.locator(".article-row")).toHaveCount(12);
  await expect(page.locator(".article-column")).toBeVisible();
});

test("an obsolete next-page request cannot jump to the beginning of a refreshed page", async ({
  page,
  request,
}) => {
  expect(
    (await request.post("/fixture/seed", { data: { count: 51 } })).ok(),
  ).toBe(true);
  await page.goto("/");
  await expect(page.locator(".article-row")).toHaveCount(50);
  await page.locator(".article-select").nth(49).click();
  await expect(page.locator("#detail-panel")).toContainText("Fixture body 49");
  let release!: () => void;
  let captured!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    captured = resolve;
  });
  await page.route("**/api/articles?*", async (route) => {
    if (new URL(route.request().url()).searchParams.get("offset") === "50") {
      captured();
      await held;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "次の記事", exact: true }).click();
  await started;
  const refreshed = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/articles" && url.searchParams.get("offset") === "0"
    );
  });
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await (await refreshed).finished();
  const obsolete = page.waitForResponse(
    (response) => new URL(response.url()).searchParams.get("offset") === "50",
  );
  release();
  await (await obsolete).finished();
  await expect(page.locator("#detail-panel")).toContainText("Fixture body 49");
  await expect(page.locator(".detail-position")).toHaveText("50 / 51");
});
