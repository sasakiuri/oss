import { test, expect, type Page } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/law-quiz');
});

// The questions are drawn at random, so the run works from what is on screen: the choices that
// are offered and the verdict that comes back, rather than from a question chosen in advance.
// The count is a row of one-tap choices; the radio itself is visually hidden behind its label.
const chooseCount = (page: Page, label: string) =>
  page.getByRole('group', { name: '出題数' }).locator('label', { hasText: label }).click();

const answerCurrentQuestion = async (page: Page, index: number) => {
  const choices = page.getByRole('group', { name: '選択肢' }).getByRole('button');
  await choices.nth(index).click();
};

test('marks each answer and shows the article it rests on', async ({ page }) => {
  await expect(page).toHaveTitle(/狩猟・銃砲の法令テスト/);
  await expect(page.getByText('猟銃等講習会の考査の再現ではありません', { exact: false })).toBeVisible();
  await chooseCount(page, '5 問');
  await page.getByRole('button', { name: 'テストを開始' }).click();

  await expect(page.getByText('1 / 5')).toBeVisible();
  await answerCurrentQuestion(page, 0);
  // Whichever way the first answer went, the article behind it is named and the law is linked.
  await expect(page.getByText(/^根拠:/)).toBeVisible();
  await expect(page.getByText(/^根拠:/)).toContainText('条');
  // The laws are linked from the sources, closed below the quiz until asked for. Exactly, because
  // the regulation's name has the act's name inside it, and a loose match would pick up whichever
  // of the two the drawn question happens to cite.
  await page.getByRole('button', { name: /^出典/ }).click();
  await expect(
    page.getByRole('link', { name: '鳥獣の保護及び管理並びに狩猟の適正化に関する法律', exact: true }).first(),
  ).toHaveAttribute('href', 'https://laws.e-gov.go.jp/law/414AC0000000088');
  await expect(page.getByRole('link', { name: '銃砲刀剣類所持等取締法', exact: true }).first()).toHaveAttribute(
    'href',
    'https://laws.e-gov.go.jp/law/333AC0000000006',
  );

  await page.getByRole('button', { name: '次の問題へ' }).click();
  await expect(page.getByText('2 / 5')).toBeVisible();
});

test('keeps the questions that were missed and offers them again', async ({ page }) => {
  await chooseCount(page, '5 問');
  await page.getByRole('button', { name: 'テストを開始' }).click();

  for (let question = 0; question < 5; question++) {
    await page.getByRole('button', { name: 'わからない（未回答で次へ）' }).click();
    await expect(page.getByText('未回答', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: question === 4 ? '結果を見る' : '次の問題へ' }).click();
  }

  await expect(page.getByRole('heading', { name: 'テスト結果' })).toBeVisible();
  await expect(page.getByText('0%', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '間違えた問題' })).toBeVisible();
  await page.getByRole('button', { name: '間違えた 5 問をもう一度' }).click();
  await expect(page.getByText('1 / 5')).toBeVisible();

  // The marks outlive a reload, and the settings screen offers them again.
  await page.reload();
  await expect(page.getByText('1 / 5')).toBeVisible();
  await page.getByRole('button', { name: 'わからない（未回答で次へ）' }).click();
  await expect(page.getByText('未回答', { exact: true })).toBeVisible();
});

test('names its sources and switches the interface to English', async ({ page }) => {
  // The sources wait closed below the quiz, with a one-line summary of what they hold.
  await page.getByRole('button', { name: /^出典/ }).click();
  await expect(page.getByRole('heading', { name: /^出典/ })).toBeVisible();
  await expect(page.getByText('平成十四年法律第八十八号', { exact: false })).toBeVisible();
  await expect(page.getByText('平成十四年環境省令第二十八号', { exact: false })).toBeVisible();
  await expect(page.getByText('その後の改正は反映していません。', { exact: false })).toBeVisible();
  await expect(page.getByText('都道府県が定めます', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: '言語を選択' }).click();
  await page.getByRole('menuitem', { name: 'English' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Start quiz' })).toBeVisible();
  await expect(page.getByText('are in Japanese.', { exact: false })).toBeVisible();
});

test('reflows at a narrow viewport and returns to the Labs list', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 667 });
  await page.getByRole('button', { name: 'テストを開始' }).click();
  await answerCurrentQuestion(page, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Labs 一覧に戻る' }).click();
  await expect(page.getByRole('heading', { name: /Labs/ })).toBeVisible();
});
