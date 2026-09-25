import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePush } from '@/features/labs-notify/use-push';

const subscription = {
  endpoint: 'https://push.example.test/browser',
  keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) },
};
const requestPermission = vi.fn();
const unsubscribe = vi.fn();
const browserSubscription = { toJSON: () => subscription, unsubscribe };
const getSubscription = vi.fn();
const subscribe = vi.fn();
const worker = { active: {}, pushManager: { getSubscription, subscribe } };
const getRegistration = vi.fn();
const register = vi.fn();
const fetchMock = vi.fn();
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  vi.resetAllMocks();
  requestPermission.mockResolvedValue('granted');
  unsubscribe.mockResolvedValue(true);
  getSubscription.mockResolvedValue(null);
  subscribe.mockResolvedValue(browserSubscription);
  getRegistration.mockResolvedValue(worker);
  register.mockResolvedValue(worker);
  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith('/key')) return json({ publicKey: 'B'.repeat(87) });
    if (url.endsWith('/test')) return json({ sent: 1 });
    return json({ removed: true });
  });
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('PushManager', class {});
  vi.stubGlobal('Notification', { requestPermission });
  vi.stubGlobal('navigator', { serviceWorker: { getRegistration, register } });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('browser push permission and subscription', () => {
  it('reads silently, asks on enable, tests delivery, then removes server and browser subscriptions', async () => {
    const { result } = renderHook(usePush);
    await waitFor(() => expect(result.current.support).toBe('supported'));
    expect(requestPermission).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
    expect(await act(() => result.current.test())).toBe(false);
    expect(await act(() => result.current.disable())).toBe(false);
    await act(() => result.current.enable());
    expect(result.current.subscription).toEqual(subscription);
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) });
    expect(await act(() => result.current.test())).toBe(true);
    getSubscription.mockResolvedValue(browserSubscription);
    expect(await act(() => result.current.disable())).toBe(true);
    expect(result.current.subscription).toBeNull();
    const deletion = fetchMock.mock.calls.find(([url]) => url.endsWith('/subscription'))!;
    expect(deletion[1]).toMatchObject({ method: 'DELETE', body: JSON.stringify({ subscription }) });
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(result.current.busy).toBe(false);
  });

  it('reuses an existing subscription without registering a worker or creating a second subscription', async () => {
    getSubscription.mockResolvedValue(browserSubscription);
    const { result } = renderHook(usePush);
    await waitFor(() => expect(result.current.subscription).toEqual(subscription));
    await act(() => result.current.enable());
    expect(subscribe).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it('does not contact the server after permission is denied and can retry', async () => {
    requestPermission.mockResolvedValueOnce('denied');
    const { result } = renderHook(usePush);
    await waitFor(() => expect(result.current.support).toBe('supported'));
    await act(() => result.current.enable());
    expect(result.current.problem).toBe('denied');
    expect(fetchMock).not.toHaveBeenCalled();
    await act(() => result.current.enable());
    expect(result.current.problem).toBeNull();
    expect(result.current.subscription).toEqual(subscription);
  });

  it('keeps the browser subscription if the server refuses its deletion', async () => {
    getSubscription.mockResolvedValue(browserSubscription);
    fetchMock.mockResolvedValue(json({ error: 'unavailable' }, 503));
    const { result } = renderHook(usePush);
    await waitFor(() => expect(result.current.subscription).toEqual(subscription));
    expect(await act(() => result.current.disable())).toBe(false);
    expect(result.current.problem).toBe('unavailable');
    expect(result.current.subscription).toEqual(subscription);
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it.each(['insecure', 'unsupported'] as const)(
    'reports %s browsers without asking for permission',
    async (support) => {
      if (support === 'insecure') vi.stubGlobal('isSecureContext', false);
      else vi.stubGlobal('navigator', {});
      const { result } = renderHook(usePush);
      await waitFor(() => expect(result.current.support).toBe(support));
      await act(() => result.current.enable());
      expect(result.current.problem).toBe(support);
      expect(requestPermission).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('waits for a newly registered worker to activate before subscribing', async () => {
    let activated!: () => void;
    const installing = {
      state: 'installing',
      addEventListener: vi.fn((_event: string, callback: () => void) => {
        activated = callback;
      }),
    };
    getRegistration.mockResolvedValue(null);
    register.mockResolvedValue({ ...worker, active: null, installing });
    const { result } = renderHook(usePush);
    await waitFor(() => expect(result.current.support).toBe('supported'));
    let enabled!: Promise<unknown>;
    act(() => {
      enabled = result.current.enable();
    });
    await waitFor(() => expect(installing.addEventListener).toHaveBeenCalled());
    expect(result.current.busy).toBe(true);
    expect(subscribe).not.toHaveBeenCalled();
    installing.state = 'activated';
    await act(async () => {
      activated();
      await enabled;
    });
    expect(register).toHaveBeenCalledWith('/labs-push-sw.js', { scope: '/labs-push/' });
    expect(result.current.subscription).toEqual(subscription);
  });
});
