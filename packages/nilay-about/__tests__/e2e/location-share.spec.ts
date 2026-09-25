import { test, expect } from './fixtures';
import { mockApi } from './labs-push';

const ROOM_ID = 'r'.repeat(22);
const membership = (host: boolean) => ({
  roomId: ROOM_ID,
  memberId: host ? 'hostmember' : 'guestmembr',
  memberToken: 't'.repeat(43),
  host,
  expiresAt: '2026-11-15T08:00:00.000Z',
});

test.use({
  geolocation: { latitude: 39.72, longitude: 140.1, accuracy: 10 },
  permissions: ['geolocation'],
});

test('creates a room, sends the position only after the switch, and closes the room', async ({ page }) => {
  const now = Date.now();
  await mockApi(page, '**/api/labs/rooms', () => ({ status: 201, body: membership(true) }));
  // Reading the room and sending a position both answer with the room.
  const roomCalls = await mockApi(page, `**/api/labs/rooms/${ROOM_ID}`, ({ method }) =>
    method !== 'DELETE'
      ? {
          body: {
            expiresAt: '2026-11-15T08:00:00.000Z',
            members: [
              { memberId: 'hostmember', name: '勢子 1', position: null },
              {
                memberId: 'other',
                name: '射手 A',
                position: { latitude: 39.729, longitude: 140.1, accuracy: 8, at: now },
              },
            ],
          },
        }
      : { body: { closed: true } },
  );

  await page.goto('/labs/location-share');
  await expect(page).toHaveTitle(/位置の共有/);
  await page.getByLabel('表示名（役割など）').fill('勢子 1');
  await page.getByLabel('合言葉', { exact: true }).fill('yamagami');
  await page.getByRole('button', { name: 'ルームを作る' }).click();

  await expect(page.getByLabel('招待リンク（合言葉は別に伝える）')).toHaveValue(
    `http://127.0.0.1:3001/labs/location-share#room=${ROOM_ID}`,
  );
  await expect(page.getByRole('list', { name: '参加者' })).toContainText('射手 A');
  expect(roomCalls.some((call) => call.method === 'PUT')).toBe(false);

  await page.getByRole('button', { name: '位置の送信を始める' }).click();
  await expect(page.getByRole('list', { name: '参加者' })).toContainText('北へ 1001 m');
  await expect
    .poll(() => roomCalls.find((call) => call.method === 'PUT')?.body)
    .toEqual({
      latitude: 39.72,
      longitude: 140.1,
      accuracy: 10,
    });
  expect(roomCalls.find((call) => call.method === 'PUT')?.headers.authorization).toBe(`Bearer ${'t'.repeat(43)}`);

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'ルームを閉じる' }).click();
  await expect(page.getByText('ルームを閉じ、全員の位置を削除しました。')).toBeVisible();
  await expect(page.getByRole('button', { name: 'ルームを作る' })).toBeVisible();
});

test('joins from an invitation link with the passphrase', async ({ page }) => {
  const joins = await mockApi(page, `**/api/labs/rooms/${ROOM_ID}/join`, ({ body }) =>
    (body as { passphrase: string }).passphrase === 'yamagami'
      ? { body: membership(false) }
      : { status: 403, body: { error: 'wrong' } },
  );
  await mockApi(page, `**/api/labs/rooms/${ROOM_ID}`, () => ({
    body: { expiresAt: '2026-11-15T08:00:00.000Z', members: [] },
  }));
  await page.goto(`/labs/location-share#room=${ROOM_ID}`);
  await page.getByLabel('表示名（役割など）').fill('射手 B');
  await page.getByLabel('合言葉', { exact: true }).fill('wrongpass');
  await page.getByRole('button', { name: '参加する' }).click();
  await expect(page.getByText('合言葉または権限を確認できませんでした。')).toBeVisible();
  await page.getByLabel('合言葉', { exact: true }).fill('yamagami');
  await page.getByRole('button', { name: '参加する' }).click();
  await expect(page.getByRole('button', { name: '退出する' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ルームを閉じる' })).toHaveCount(0);
  expect(joins.at(-1)?.body).toEqual({ passphrase: 'yamagami', name: '射手 B' });
});
