// SPDX-License-Identifier: MIT
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  expect((await request.post("/__test/reset")).status()).toBe(200);
  expect(
    (await request.post("/fixture/seed", { data: { count: 151 } })).status(),
  ).toBe(200);
});
test("bounded pages, search, on-demand details and keyboard focus work on wide and narrow screens", async ({
  page,
}) => {
  const lists: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/api/articles?")) lists.push(response.url());
  });
  await page.goto("/");
  await expect(page.locator("#article-list > article")).toHaveCount(50);
  await expect(page.locator("#list-count")).toHaveText("151 件");
  const status = await (await page.request.get("/api/state")).json();
  expect(status).not.toHaveProperty("articles");
  const first = await (await page.request.get("/api/articles?limit=50")).json();
  expect(first.articles).toHaveLength(50);
  expect(first.articles[0]).not.toHaveProperty("body");
  await page.getByRole("button", { name: "次のページ", exact: true }).click();
  await expect(page.locator("#list-footnote")).toContainText("51–100");
  await expect(page.locator("#article-list button").first()).toBeFocused();
  await page.getByRole("button", { name: "前のページ", exact: true }).click();
  await expect(page.locator("#list-footnote")).toContainText("1–50");
  await page.locator("#search").fill("Article 0100");
  await expect(page.locator("#article-list > article")).toHaveCount(1);
  await expect(page.locator("#list-count")).toHaveText("1 件");
  await page.getByRole("button", { name: /Article 0100.*詳細を読む/ }).click();
  await expect(page.locator("#detail-panel")).toContainText("Fixture body 100");
  if (page.viewportSize()!.width < 960)
    await expect(page.locator("#detail-panel")).toBeFocused();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Article 0100.*詳細を読む/ }),
  ).toBeFocused();
  expect(lists.some((url) => url.includes("offset=50"))).toBe(true);
});
test("clearing a no-match filter retrieves the first page immediately", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#article-list > article")).toHaveCount(50);
  await page.locator("#select-all-articles").check();
  await page.locator("#search").fill("no-matching-fixture");
  await expect(page.locator("#article-list > article")).toHaveCount(0);
  const recovered = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/articles" &&
      url.searchParams.get("query") === "" &&
      url.searchParams.get("offset") === "0" &&
      response.ok()
    );
  });
  await page
    .getByRole("button", { name: "絞り込みを解除", exact: true })
    .click();
  await recovered;
  await expect(page.locator("#article-list > article")).toHaveCount(50);
  await expect(page.locator("#list-count")).toHaveText("151 件");
  await expect(page.locator("#search")).toHaveValue("");
  await expect(page.locator("#selection-count")).toHaveText("0 件選択中");
});
test("bulk selection applies to the displayed page and resets on filtering", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#article-list > article")).toHaveCount(50);
  await page.locator("#select-all-articles").check();
  await expect(page.locator("#selection-count")).toHaveText("50 件選択中");
  await page
    .getByRole("button", { name: "選択した記事を見送る", exact: true })
    .click();
  await expect(page.locator("#list-count")).toHaveText("101 件");
  await expect(page.locator("#selection-count")).toHaveText("0 件選択中");
  await page.locator("#select-all-articles").check();
  await page.locator("#search").fill("Article 0100");
  await expect(page.locator("#article-list > article")).toHaveCount(1);
  await expect(page.locator("#selection-count")).toHaveText("0 件選択中");
  const state = await (await page.request.get("/api/state")).json();
  expect(state.stats.buckets.dismissed).toBe(50);
});
test("failed review leaves the article available for an explicit retry", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#article-list > article")).toHaveCount(50);
  await page.getByRole("button", { name: /Article 0000.*詳細を読む/ }).click();
  await expect(page.locator("#detail-panel")).toContainText("Fixture body 0");
  let fail = true;
  await page.route("**/api/articles/*/review", async (route) => {
    if (fail) {
      fail = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Fixture retry" }),
      });
    } else await route.continue();
  });
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator("#notice-text")).toContainText("Fixture retry");
  await expect(page.locator("#detail-panel")).toContainText("Fixture body 0");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator("#notice-text")).toHaveText("保存しました。");
  expect(
    (await (await page.request.get("/api/state")).json()).stats.buckets.saved,
  ).toBe(1);
});

test("manual publication resolution requires an explicit operator action and keeps posting disabled", async ({
  page,
}) => {
  expect(
    (await page.request.post("/fixture/safety-stop", { data: {} })).status(),
  ).toBe(200);
  await page.goto("/");
  await page.getByRole("button", { name: /^保存済み 1$/ }).click();
  await expect(page.locator("#article-list > article")).toHaveCount(1);
  await page.locator("#article-list .article-select").click();
  await expect(
    page.getByRole("button", {
      name: "Buffer の予約なし・X の未投稿を確認した",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Buffer の予約なし・X の未投稿を確認した",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Buffer の予約なし・X の未投稿を確認した",
      exact: true,
    }),
  ).toHaveCount(0);
  const state = await (await page.request.get("/api/state")).json();
  expect(state.publication.posts).toHaveLength(0);
  expect(state.settings.autoPost).toBe(false);
});
