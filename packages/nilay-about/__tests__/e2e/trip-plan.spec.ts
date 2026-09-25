import { readFile } from 'node:fs/promises';

import { test, expect } from './fixtures';

test('makes the card and an iCalendar file with an alarm at the time due back', async ({ page }) => {
  await page.goto('/labs/trip-plan');
  await expect(page).toHaveTitle(/入山計画と帰着予定/);
  await page.getByLabel('氏名', { exact: true }).fill('山田 太郎');
  await page.getByLabel('行き先（猟場・山域）').fill('○○山');
  await page.getByLabel('出発', { exact: true }).fill('2026-11-15T06:00');
  await page.getByLabel('帰着予定', { exact: true }).fill('2026-11-15T16:30');
  await page.getByLabel('緊急連絡先（電話）').fill('090-0000-0000');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'カレンダーに追加（.ics）' }).click();
  const path = await (await download).path();
  if (!path) throw new Error('No download');
  const ics = (await readFile(path, 'utf8')).replace(/\r\n /g, '');
  expect(ics).toContain('BEGIN:VEVENT');
  expect(ics).toContain('TRIGGER;RELATED=END:PT0M');
  expect(ics).toContain('LOCATION:○○山');

  // Not saved unless asked.
  await page.reload();
  await expect(page.getByLabel('氏名', { exact: true })).toHaveValue('');
});

test('prints only the card', async ({ page }) => {
  await page.goto('/labs/trip-plan');
  await page.getByLabel('氏名', { exact: true }).fill('山田 太郎');
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('region', { name: '印刷用のカード' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'カードを印刷' })).toBeHidden();
});
