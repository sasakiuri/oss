import { quizList } from '../../features/game-species/quiz-data';

import { test, expect, type Page } from './fixtures';

// The settings wait closed below the slideshow; the summary line opens them.
const openSettings = (page: Page) => page.getByRole('button', { name: /^出題設定/ }).click();
// Settings are rows of one-tap choices; the radio itself is visually hidden behind its label.
const pick = (page: Page, group: string, label: string) =>
  page.getByRole('group', { name: group }).locator('label', { hasText: label }).click();
const openQuizMode = (page: Page) => page.locator('label', { hasText: '判別テスト' }).click();

test('remembers missed species, resumes progress and offers a focused review', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/labs/game-species-test');
  await expect(page.getByText('1 / 45', { exact: true })).toBeVisible();
  const firstImage = await page.locator('figure img').getAttribute('src');
  await page.getByRole('button', { name: '答えを見る', exact: true }).click();
  await page.getByRole('button', { name: '要復習', exact: true }).click();
  await expect(page.getByText('2 / 45', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '答えを見る', exact: true })).toBeFocused();
  await page.reload();
  await expect(page.getByText('2 / 45', { exact: true })).toBeVisible();
  await expect(page.getByText('前回の続きから再開しています。')).toBeVisible();
  await openSettings(page);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '要復習から出題（1 問）', exact: true }).click();
  await expect(page.locator('figure img')).toHaveAttribute('src', firstImage!);
  await expect(page.getByText('1 / 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '答えを見る', exact: true }).click();
  await page.getByRole('button', { name: 'わかった', exact: true }).click();
  await expect(page.getByRole('heading', { name: '学習結果' })).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  await expect(page.getByRole('button', { name: '要復習から出題（0 問）' })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('autoplay reveals each answer, remains ungraded, and resumes paused', async ({ page }) => {
  await page.clock.install();
  await page.goto('/labs/game-species-test');
  await expect(page.getByRole('button', { name: '答えを見る', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '自動再生', exact: true }).click();
  await page.clock.fastForward(3100);
  await expect(page.getByRole('button', { name: 'わかった', exact: true })).toBeVisible();
  await page.clock.fastForward(3100);
  await expect(page.getByText('2 / 45', { exact: true })).toBeVisible();
  await openSettings(page);
  await expect(page.getByRole('button', { name: '要復習から出題（0 問）' })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('button', { name: '自動再生', exact: true })).toHaveAttribute('aria-pressed', 'false');
});

test('can go back without cropping photos or overflowing a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 667 });
  await page.goto('/labs/game-species-test');
  await page.getByRole('button', { name: '採点せず次へ' }).click();
  await page.getByRole('button', { name: '前へ', exact: true }).click();
  await expect(page.getByText('1 / 45', { exact: true })).toBeVisible();
  await expect(page.locator('figure img')).toHaveCSS('object-fit', 'contain');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // Enter on a focused control must not also run the global answer shortcut.
  await page.getByRole('button', { name: '採点せず次へ' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('2 / 45', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '答えを見る', exact: true })).toBeVisible();
});

test('recovers from corrupt saved data and handles unavailable storage', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('nilay-labs-species-v1', '{broken');
    Storage.prototype.setItem = () => {
      throw new DOMException('Blocked', 'SecurityError');
    };
  });
  await page.goto('/labs/game-species-test');
  await expect(page.getByRole('button', { name: '答えを見る', exact: true })).toBeVisible();
  await expect(page.locator('p:not(.sr-only)', { hasText: 'このブラウザーでは記録を保存できません。' })).toBeVisible();
  await page.getByRole('button', { name: '答えを見る', exact: true }).click();
  await expect(page.getByRole('button', { name: 'わかった', exact: true })).toBeVisible();
});

test('starts a short session and reviews only the selected ungraded answers', async ({ page }) => {
  await page.goto('/labs/game-species-test');
  await expect(page.getByRole('button', { name: /^出題設定/ })).toContainText('全種類 · 45 問');
  await openSettings(page);
  await pick(page, '種類', '獣類');
  await pick(page, '問題数', '5 問');
  await expect(page.getByText('1 / 45', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'この設定で開始（5 問）' }).click();
  await expect(page.getByText('1 / 5', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '答えを見る', exact: true }).click();
  await page.getByRole('button', { name: '要復習', exact: true }).click();
  await page.getByRole('button', { name: '答えを見る', exact: true }).click();
  await page.getByRole('button', { name: 'わかった', exact: true }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '採点せず次へ' }).click();
  await expect(page.getByRole('heading', { name: '学習結果' })).toBeVisible();
  await page
    .getByRole('group', { name: '回答の絞り込み' })
    .getByRole('button', { name: '未採点', exact: true })
    .click();
  await expect(page.getByRole('checkbox')).toHaveCount(3);
  await page.getByRole('button', { name: '選択を解除' }).click();
  await page.getByRole('button', { name: '表示中を選択' }).click();
  const selected = await page
    .getByRole('checkbox')
    .evaluateAll((inputs) => inputs.map((input) => input.closest('label')?.textContent));
  await page.getByRole('button', { name: '選んだ 3 問を復習' }).click();
  await expect(page.getByText('1 / 3', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('1 / 3', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '答えを見る', exact: true }).click();
  const answer = await page.locator('figure').locator('img').getAttribute('alt');
  expect(selected.some((name) => name?.includes(answer!))).toBe(true);
});

test('enlarges an unanswered image without revealing the name and pauses playback', async ({ page }) => {
  await page.clock.install();
  await page.goto('/labs/game-species-test');
  await page.getByRole('button', { name: '自動再生', exact: true }).click();
  // Playing before the dialog opens, or the check below that it stopped would hold just as well
  // for a run that never started.
  await expect(page.getByRole('button', { name: '一時停止', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '画像を拡大', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading')).toHaveText('出題中の鳥獣');
  await expect(dialog.locator('img')).toHaveCSS('object-fit', 'contain');
  await page.clock.fastForward(12000);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '画像を拡大', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: '自動再生', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText('1 / 45', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '答えを見る', exact: true })).toBeVisible();
});

test('scores a four-choice quiz, counts a timeout as no answer, and reviews only the misses', async ({ page }) => {
  // Time only moves when this test moves it, so no question can run out underneath the several
  // round-trips each answer takes, and the one that is meant to run out costs no waiting.
  await page.clock.install();
  await page.goto('/labs/game-species-test');
  await openQuizMode(page);
  // Not the default, or the choice could stop working and nothing here would notice.
  await pick(page, '出題数', '16 問');
  await pick(page, '1 問の制限時間', '5 秒');
  await page.getByRole('button', { name: 'テストを開始（16 問）' }).click();
  const choices = page.getByRole('group', { name: '選択肢' }).getByRole('button');
  await expect(page.getByText('1 / 16', { exact: true })).toBeVisible();
  await expect(choices.first()).toBeFocused();
  await expect(choices).toHaveCount(4);
  const shownSpecies = async () => {
    const source = decodeURIComponent((await page.locator('figure img').first().getAttribute('src')) ?? '');
    const quiz = quizList.find((item) => source.includes(item.image));
    expect(quiz, `unknown photo: ${source}`).toBeDefined();
    return quiz!.answer;
  };
  await page.getByRole('button', { name: await shownSpecies(), exact: true }).click();
  // The second question is left to time out, which the results must count as no answer.
  await expect(page.getByText('2 / 16', { exact: true })).toBeVisible();
  await page.clock.fastForward(6000);
  // The loop below opens by waiting for question 3, so the move onto it is already checked there.
  for (let question = 3; question <= 16; question++) {
    await expect(page.getByText(`${question} / 16`, { exact: true })).toBeVisible();
    const answer = await shownSpecies();
    const names = (await choices.allInnerTexts()).map((text) => text.trim());
    await choices.nth(names.findIndex((name) => name !== answer)).click();
  }
  await expect(page.getByRole('heading', { name: 'テスト結果' })).toBeFocused();
  // One right out of sixteen, rounded.
  await expect(page.getByText('6%', { exact: true })).toBeVisible();
  // Whole text, not a substring: '正答10' would satisfy a check for '1'.
  const score = page.locator('dl > div');
  await expect(score.filter({ hasText: '正答' })).toHaveText(/^正答\s*1$/);
  await expect(score.filter({ hasText: '誤答' })).toHaveText(/^誤答\s*14$/);
  await expect(score.filter({ hasText: '未回答' })).toHaveText(/^未回答\s*1$/);
  // The score is not a verdict on the licence exam, and the results say so where the score is read.
  await expect(page.getByText('非狩猟鳥獣も出題され', { exact: false })).toBeVisible();
  // One tap from the score reviews every miss; the list below it can narrow the pick.
  await expect(page.getByRole('button', { name: '間違えた 15 種をスライドショーで復習' })).toBeInViewport();
  await page.getByRole('button', { name: '選んだ 15 問をスライドショーで復習' }).click();
  await expect(page.getByText('1 / 15', { exact: true })).toBeVisible();
  await openSettings(page);
  await expect(page.getByRole('button', { name: '要復習から出題（15 問）' })).toBeEnabled();
});

test('states the limits of the quiz and drops an unfinished one on reload', async ({ page }) => {
  await page.goto('/labs/game-species-test');
  await openQuizMode(page);
  await expect(page.getByText('非狩猟鳥獣も出題され', { exact: false })).toBeVisible();
  await expect(page.getByText('テストの途中経過は保存しません。')).toBeVisible();
  await expect(page.getByText('誤答・未回答の鳥獣を「要復習」に記録します。', { exact: false })).toBeVisible();
  await pick(page, '1 問の制限時間', '無制限');
  await page.getByRole('button', { name: 'テストを開始（10 問）' }).click();
  await expect(page.getByText('1 / 10', { exact: true })).toBeVisible();
  await expect(page.getByText('残り時間')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: '答えを見る', exact: true })).toBeVisible();
  await openSettings(page);
  await expect(page.getByRole('button', { name: '要復習から出題（0 問）' })).toBeDisabled();
});
