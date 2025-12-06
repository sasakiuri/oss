import { test, expect } from "@playwright/test";

test.describe("Home Target Calculator", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/labs/home-target");
  });

  test("should display calculator interface", async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/Target Calculator/);

    // Check main UI elements (Japanese is default)
    await expect(page.getByText("標的の中心の高さ")).toBeVisible();
    await expect(page.getByText("黒い領域の大きさ")).toBeVisible();
    await expect(page.getByLabel("目の高さ")).toBeVisible();
    await expect(page.getByLabel("標的を設置したい距離")).toBeVisible();
  });

  test("should calculate target height dynamically", async ({ page }) => {
    // Get initial calculated value
    const initialHeight = await page.locator("text=cm").first().textContent();

    // Change eye height
    const eyeHeightInput = page.getByLabel("目の高さ");
    await eyeHeightInput.fill("180");

    // Calculated height should update
    const newHeight = await page.locator("text=cm").first().textContent();
    expect(newHeight).not.toBe(initialHeight);
  });

  test("should switch language to English", async ({ page }) => {
    // Click language menu
    await page.getByRole("button", { name: /EN|日本語/ }).click();

    // Select English
    await page.getByText("English").click();

    // UI should update to English
    await expect(page.getByText("Height of Target Center")).toBeVisible();
    await expect(page.getByText("Black Area Size")).toBeVisible();
  });

  test("should open discipline dialog", async ({ page }) => {
    // Click the edit button for discipline
    await page.getByRole("button", { name: /編集|Edit/ }).click();

    // Dialog should open
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("combobox")).toBeVisible();
  });

  test("should change discipline", async ({ page }) => {
    // Open discipline dialog
    await page.getByRole("button", { name: /編集|Edit/ }).click();

    // Select a different discipline
    await page.getByRole("combobox").selectOption("FR50");

    // Close dialog
    await page.getByRole("button", { name: "OK" }).click();

    // Check discipline name updated
    await expect(page.getByText("50m Rifle")).toBeVisible();
  });

  test("should enable custom discipline mode", async ({ page }) => {
    // Open discipline dialog
    await page.getByRole("button", { name: /編集|Edit/ }).click();

    // Select Custom
    await page.getByRole("combobox").selectOption("CUSTOM");

    // Inputs should be editable
    const distanceInput = page
      .getByRole("dialog")
      .getByRole("spinbutton")
      .first();
    await expect(distanceInput).not.toHaveAttribute("readonly");
  });

  test("should show download button", async ({ page }) => {
    // Check download button exists
    const downloadButton = page.getByRole("button", { name: /Get Target/ });
    await expect(downloadButton).toBeVisible();
  });

  test("should have proper mobile layout", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // UI should still be functional
    await expect(page.getByText("標的の中心の高さ")).toBeVisible();
    await expect(page.getByLabel("目の高さ")).toBeVisible();
  });
});

test.describe("Home Target Calculator Accessibility", () => {
  test("should have accessible form labels", async ({ page }) => {
    await page.goto("/labs/home-target");

    // Check inputs have associated labels
    const eyeHeightInput = page.getByLabel("目の高さ");
    await expect(eyeHeightInput).toBeVisible();

    const distanceInput = page.getByLabel("標的を設置したい距離");
    await expect(distanceInput).toBeVisible();
  });

  test("should be keyboard navigable", async ({ page }) => {
    await page.goto("/labs/home-target");

    // Tab through focusable elements
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");

    // Should be able to reach input fields
    const focusedElement = await page.evaluate(() =>
      document.activeElement?.tagName.toLowerCase()
    );
    expect(["input", "button", "select", "a"]).toContain(focusedElement);
  });

  test("should have proper heading structure", async ({ page }) => {
    await page.goto("/labs/home-target");

    // Check h1 exists (app title)
    const h1 = page.locator("h1");
    await expect(h1).toHaveText(/Target Calculator|標的を計算/);
  });
});
