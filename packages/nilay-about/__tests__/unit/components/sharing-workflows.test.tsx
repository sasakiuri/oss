import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EVENT_RESULTS_STORAGE_KEY, useEventResultsStore } from '@/app/(standalone)/labs/event-results/_store';
import { EventResultsClient } from '@/app/(standalone)/labs/event-results/event-results-client';
import { useLocationShareStore } from '@/app/(standalone)/labs/location-share/_store';
import { LocationShareClient } from '@/app/(standalone)/labs/location-share/location-share-client';
import { useTrapAlertsStore } from '@/app/(standalone)/labs/trap-alerts/_store';
import { TrapAlertsClient } from '@/app/(standalone)/labs/trap-alerts/trap-alerts-client';
import { useStorageStatus } from '@/lib/browser-storage';
import { useLanguageStore } from '@/store';

vi.mock('@/components/labs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/labs')>();
  const { createElement } = await import('react');
  return {
    ...actual,
    AppLayout: ({ header, children }: { header: ReactNode; children: ReactNode }) =>
      createElement('div', null, header, children),
    AppHeader: ({ title, actions }: { title: string; actions?: ReactNode }) =>
      createElement('header', null, title, actions),
    LanguageMenu: () => null,
  };
});
const push = vi.hoisted(() => ({
  support: 'supported' as const,
  subscription: { endpoint: 'https://push.example.test/device', keys: { p256dh: 'test', auth: 'test' } },
  busy: false,
  problem: null,
  enable: vi.fn(),
  disable: vi.fn(),
  test: vi.fn(),
}));
vi.mock('@/features/labs-notify/use-push', () => ({ usePush: () => push }));

const transport = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const loaded = () => waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const expiresAt = '2030-12-31T00:00:00.000Z';
const resultId = 'abcDEF123_-xyz12';
const roomId = 'r'.repeat(22);
const membership = { roomId, memberId: 'hostmember', memberToken: 't'.repeat(43), host: true, expiresAt };
const hook = {
  hookId: 'h'.repeat(43),
  triggerToken: 'k'.repeat(43),
  manageToken: 'm'.repeat(43),
  label: '沢の箱わな',
  expiresAt,
};

beforeEach(() => {
  useEventResultsStore.setState(useEventResultsStore.getInitialState(), true);
  useLocationShareStore.setState(useLocationShareStore.getInitialState(), true);
  useTrapAlertsStore.setState(useTrapAlertsStore.getInitialState(), true);
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
  useLanguageStore.setState({ language: 'ja' });
  useStorageStatus.setState({ available: true, discarded: [] });
  transport.mockReset();
  vi.stubGlobal('fetch', transport);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('shared Labs services', () => {
  it('publishes, reloads, edits and deletes results without saving the passphrase', async () => {
    const view = {
      title: '秋季大会',
      note: '',
      columns: ['氏名', '点数'],
      rows: [['山田', '25']],
      updatedAt: '2026-09-26T00:00:00.000Z',
      expiresAt,
    };
    transport.mockImplementation(async (url, init) => {
      if (String(url) === '/api/labs/results') return json({ id: resultId, expiresAt }, 201);
      return json(init?.method === 'DELETE' ? { removed: true } : view);
    });
    render(<EventResultsClient />);
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: '公開する' }));
    expect(transport).not.toHaveBeenCalled();
    change('大会名', '秋季大会');
    change('成績表（1 行目は見出し）', '氏名\t点数\n山田\t25');
    change('主催者の合言葉', 'club-2026');
    fireEvent.click(screen.getByRole('button', { name: '公開する' }));
    await screen.findByText('リザルトを公開しました。');
    expect(JSON.parse(String(transport.mock.calls[0]![1]?.body))).toEqual({
      passphrase: 'club-2026',
      days: 30,
      content: { title: view.title, note: '', columns: view.columns, rows: view.rows },
    });
    expect(window.localStorage.getItem(EVENT_RESULTS_STORAGE_KEY)).not.toContain('club-2026');
    fireEvent.click(screen.getByRole('button', { name: '新しく作る' }));
    fireEvent.click(screen.getByRole('button', { name: '修正する' }));
    await screen.findByText('読み込みました。修正には作成時の合言葉が必要です。');
    expect(screen.getByLabelText('大会名')).toHaveValue('秋季大会');
    fireEvent.click(screen.getByRole('button', { name: '更新する' }));
    await screen.findByText('リザルトを更新しました。');
    fireEvent.click(screen.getByRole('button', { name: '削除する' }));
    await screen.findByText('リザルトを削除しました。');
    expect(useEventResultsStore.getState().value.pages).toEqual([]);
  });

  it('keeps a failed publication editable and reports the server rejection', async () => {
    transport.mockResolvedValue(json({ error: 'rate limited' }, 429));
    render(<EventResultsClient />);
    await loaded();
    change('大会名', '練習会');
    change('成績表（1 行目は見出し）', '氏名,点数\n山田,25');
    change('主催者の合言葉', 'club-2026');
    fireEvent.click(screen.getByRole('button', { name: '公開する' }));
    await screen.findByText('操作が多すぎます。少し待ってからお試しください。');
    expect(screen.getByLabelText('大会名')).toHaveValue('練習会');
    expect(useEventResultsStore.getState().value.pages).toEqual([]);
  });

  it('does not send a position before consent and clears the watch when a room closes', async () => {
    let onPosition: PositionCallback | undefined;
    const clearWatch = vi.fn();
    const geolocation = {
      watchPosition: vi.fn((callback: PositionCallback) => {
        onPosition = callback;
        return 7;
      }),
      clearWatch,
    };
    vi.stubGlobal('navigator', { geolocation });
    const room = {
      expiresAt,
      members: [
        { memberId: 'hostmember', name: '勢子 1', position: null },
        {
          memberId: 'other',
          name: '射手 A',
          position: { latitude: 39.729, longitude: 140.1, accuracy: 8, at: Date.now() },
        },
      ],
    };
    transport.mockImplementation(async (url, init) =>
      json(String(url) === '/api/labs/rooms' ? membership : init?.method === 'DELETE' ? { closed: true } : room),
    );
    render(<LocationShareClient />);
    await loaded();
    change('表示名（役割など）', '勢子 1');
    change('合言葉', 'yamagami');
    fireEvent.click(screen.getByRole('button', { name: 'ルームを作る' }));
    await screen.findByRole('list', { name: '参加者' });
    expect(geolocation.watchPosition).not.toHaveBeenCalled();
    expect(transport.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '位置の送信を始める' }));
    await act(async () =>
      onPosition!({ coords: { latitude: 39.72, longitude: 140.1, accuracy: 10 } } as GeolocationPosition),
    );
    await waitFor(() => expect(transport.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true));
    const sent = transport.mock.calls.find(([, init]) => init?.method === 'PUT')![1]!;
    expect(JSON.parse(String(sent.body))).toEqual({ latitude: 39.72, longitude: 140.1, accuracy: 10 });
    expect(sent.headers).toMatchObject({ Authorization: `Bearer ${membership.memberToken}` });
    expect(screen.getByRole('list', { name: '参加者' })).toHaveTextContent('北へ 1001 m');
    fireEvent.click(screen.getByRole('button', { name: 'ルームを閉じる' }));
    await screen.findByText('ルームを閉じ、全員の位置を削除しました。');
    expect(clearWatch).toHaveBeenCalledWith(7);
    expect(useLocationShareStore.getState().value.membership).toBeNull();
  });

  it('rejects a wrong room passphrase and joins an invitation without host controls', async () => {
    window.history.replaceState(null, '', `/#room=${roomId}`);
    transport.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/join'))
        return JSON.parse(String(init?.body)).passphrase === 'yamagami'
          ? json({ ...membership, host: false })
          : json({ error: 'wrong' }, 403);
      return json({ expiresAt, members: [] });
    });
    render(<LocationShareClient />);
    await loaded();
    change('表示名（役割など）', '射手 B');
    change('合言葉', 'wrongpass');
    fireEvent.click(await screen.findByRole('button', { name: '参加する' }));
    await screen.findByText('合言葉または権限を確認できませんでした。');
    change('合言葉', 'yamagami');
    fireEvent.click(screen.getByRole('button', { name: '参加する' }));
    await screen.findByRole('button', { name: '退出する' });
    expect(screen.queryByRole('button', { name: 'ルームを閉じる' })).not.toBeInTheDocument();
  });

  it('keeps trigger and management credentials separate when creating and deleting a hook', async () => {
    transport.mockImplementation(async (_url, init) => json(init?.method === 'DELETE' ? { removed: true } : hook));
    render(<TrapAlertsClient />);
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'URL を発行する' }));
    expect(screen.getByText('名前を入力してください。')).toBeInTheDocument();
    expect(transport).not.toHaveBeenCalled();
    change('名前（通知の見出しに表示）', hook.label);
    fireEvent.click(screen.getByRole('button', { name: 'URL を発行する' }));
    await screen.findByText('通知用 URL を発行しました。');
    expect(screen.getByLabelText('沢の箱わな の URL')).toHaveValue(
      `${window.location.origin}/api/labs/hooks/${hook.triggerToken}`,
    );
    expect((screen.getByLabelText('沢の箱わな の URL') as HTMLInputElement).value).not.toContain(hook.manageToken);
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    await screen.findByText('通知用 URL を削除しました。');
    expect(JSON.parse(String(transport.mock.calls.at(-1)![1]?.body))).toEqual({
      hookId: hook.hookId,
      manageToken: hook.manageToken,
    });
    expect(useTrapAlertsStore.getState().value.hooks).toEqual([]);
  });

  it('refuses a trigger URL as a manage link, then adds the device with valid management credentials', async () => {
    transport.mockResolvedValue(json({ hookId: hook.hookId, label: hook.label, expiresAt }));
    render(<TrapAlertsClient />);
    await loaded();
    const label = '管理用リンクをこの端末で開くか、貼り付けます。';
    change(label, `${window.location.origin}/api/labs/hooks/${hook.triggerToken}`);
    fireEvent.click(screen.getByRole('button', { name: 'この端末を追加' }));
    expect(screen.getByText('管理用リンクを貼り付けてください。')).toBeInTheDocument();
    expect(transport).not.toHaveBeenCalled();
    change(
      label,
      `${window.location.origin}/labs/trap-alerts#manage=${hook.hookId}.${hook.manageToken}.${hook.triggerToken}`,
    );
    fireEvent.click(screen.getByRole('button', { name: 'この端末を追加' }));
    await screen.findByText('この端末にも通知が届くようにしました。');
    expect(JSON.parse(String(transport.mock.calls[0]![1]?.body))).toMatchObject({
      hookId: hook.hookId,
      manageToken: hook.manageToken,
      subscription: push.subscription,
    });
  });
});
