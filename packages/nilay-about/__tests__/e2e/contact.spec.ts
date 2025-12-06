import { test, expect } from "@playwright/test";

test.describe("Contact Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/contact");
  });

  test("should display contact form", async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/お問い合わせ/);

    // Check form elements exist
    await expect(page.getByLabel("返信を希望する")).toBeVisible();
    await expect(page.getByLabel("タイトル *")).toBeVisible();
    await expect(page.getByLabel("お問い合わせ内容 *")).toBeVisible();
    await expect(page.getByRole("button", { name: "送信" })).toBeVisible();
  });

  test("should show email field when reply is requested", async ({ page }) => {
    // Initially email field should not be visible
    await expect(page.getByLabel("Ｅメールアドレス *")).not.toBeVisible();

    // Check the checkbox
    await page.getByLabel("返信を希望する").check();

    // Email field should now be visible
    await expect(page.getByLabel("Ｅメールアドレス *")).toBeVisible();
  });

  test("should show validation errors for required fields", async ({
    page,
  }) => {
    // Try to submit empty form
    await page.getByRole("button", { name: "送信" }).click();

    // Check for validation error messages
    await expect(page.getByText("タイトルは必須です")).toBeVisible();
    await expect(page.getByText("お問い合わせ内容は必須です")).toBeVisible();
  });

  test("should show email validation error when reply requested", async ({
    page,
  }) => {
    // Check reply checkbox
    await page.getByLabel("返信を希望する").check();

    // Fill in other fields but leave email empty
    await page.getByLabel("タイトル *").fill("テストタイトル");
    await page.getByLabel("お問い合わせ内容 *").fill("テストメッセージ");

    // Try to submit
    await page.getByRole("button", { name: "送信" }).click();

    // Check for email validation error
    await expect(
      page.getByText("返信を希望する場合はＥメールアドレスが必要です")
    ).toBeVisible();
  });

  test("should have accessible form with aria attributes", async ({ page }) => {
    // Submit to trigger errors
    await page.getByRole("button", { name: "送信" }).click();

    // Check aria-invalid is set on invalid fields
    const titleInput = page.getByLabel("タイトル *");
    await expect(titleInput).toHaveAttribute("aria-invalid", "true");

    // Check aria-describedby links to error message
    await expect(titleInput).toHaveAttribute("aria-describedby", "title-error");
  });

  test("should show contact info section", async ({ page }) => {
    // Check for contact info
    await expect(page.getByText("その他の連絡方法")).toBeVisible();
    await expect(page.getByText("contact@mail.nilay.jp")).toBeVisible();
  });
});

test.describe("Contact Page Accessibility", () => {
  test("should have no accessibility violations", async ({ page }) => {
    await page.goto("/contact");

    // Check skip link exists and is focusable
    await page.keyboard.press("Tab");
    const skipLink = page.getByText("メインコンテンツへスキップ");
    await expect(skipLink).toBeFocused();
  });

  test("should have proper heading hierarchy", async ({ page }) => {
    await page.goto("/contact");

    // Check h1 exists
    const h1 = page.locator("h1");
    await expect(h1).toHaveText(/お問い合わせ/);

    // Check h2 exists for sections
    const h2Elements = page.locator("h2");
    expect(await h2Elements.count()).toBeGreaterThanOrEqual(1);
  });
});
