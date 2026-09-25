import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/wind-practice');
});

test('asks for the wind value of a direction and tallies the answer by direction', async ({ page }) => {
  await expect(page).toHaveTitle(/風読みの練習/);
  const question = page.getByText(/時から吹く風。射線を横切る割合は何 % ですか。/);
  await expect(question).toBeVisible();
  // Answer from the hour in the question, so the test does not depend on the random draw.
  const hour = Number((await question.textContent())!.match(/^(\d+) 時/)![1]);
  const share = Math.round(Math.abs(Math.sin((hour * Math.PI) / 6)) * 100);
  await page.getByLabel('答え（%）').fill(String(share));
  await page.getByRole('button', { name: '答える' }).click();
  await expect(page.getByText(/^正解。答えは/)).toBeVisible();
  await expect(page.getByText('直近 1 問中 1 問正解。')).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(`^${hour} 時`) })).toContainText('1 / 1');
  // The record survives a reload.
  await page.reload();
  await expect(page.getByText('直近 1 問中 1 問正解。')).toBeVisible();
});

test('asks for a hold with its side, and marks a wrong side as wrong', async ({ page }) => {
  // The radio is visually hidden inside its segment, so the reader's target is the segment itself.
  await page
    .locator('label')
    .filter({ has: page.getByRole('radio', { name: 'ホールド量' }) })
    .click();
  const question = page.getByText(/どちらに何 mil 持ちますか。/);
  await expect(question).toBeVisible();
  await page.getByLabel('答え（mil）').fill('50');
  await page.getByRole('button', { name: '答える' }).click();
  await expect(page.getByText(/^不正解。答えは/)).toBeVisible();
  await page.getByRole('button', { name: '次の問題' }).click();
  await expect(page.getByLabel('答え（mil）')).toHaveValue('');
});
