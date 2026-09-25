import type { Page, Route } from '@playwright/test';

/** A subscription as a browser's push manager would give it; no push service is contacted. */
export const FAKE_SUBSCRIPTION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-device',
  keys: { p256dh: `B${'A'.repeat(86)}`, auth: 'a'.repeat(22) },
};

/**
 * Stands in for the Notification, service worker and push manager APIs, so the Labs pages can be
 * driven without a push service or a permission prompt.
 */
export async function stubPush(page: Page) {
  await page.addInitScript((subscription) => {
    // Kept for the tab, as a real subscription outlives a reload.
    let subscribed = sessionStorage.getItem('e2e-push') === '1';
    const pushSubscription = {
      toJSON: () => subscription,
      unsubscribe: async () => {
        subscribed = false;
        sessionStorage.removeItem('e2e-push');
        return true;
      },
    };
    const registration = {
      // The Labs offline support posts the pages and files to keep to the active worker.
      active: { postMessage: () => undefined },
      pushManager: {
        getSubscription: async () => (subscribed ? pushSubscription : null),
        subscribe: async () => {
          subscribed = true;
          sessionStorage.setItem('e2e-push', '1');
          return pushSubscription;
        },
      },
    };
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: Object.assign(function Notification() {}, {
        permission: 'default',
        requestPermission: async () => 'granted',
      }),
    });
    Object.defineProperty(window, 'PushManager', { configurable: true, value: function PushManager() {} });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: async () => (subscribed ? registration : undefined),
        register: async () => registration,
        // As in a browser: settles once a worker is active, which the offline support waits for.
        ready: Promise.resolve(registration),
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
    });
  }, FAKE_SUBSCRIPTION);
}

/** Answers a Labs API with JSON and records what the page sent. */
export async function mockApi(
  page: Page,
  url: string | RegExp,
  answer: (request: { method: string; body: unknown; headers: Record<string, string> }) => {
    status?: number;
    body: unknown;
  },
) {
  const calls: { method: string; body: unknown; headers: Record<string, string> }[] = [];
  await page.route(url, async (route: Route) => {
    const request = route.request();
    const call = { method: request.method(), body: request.postDataJSON() as unknown, headers: request.headers() };
    calls.push(call);
    const { status = 200, body } = answer(call);
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return calls;
}

export const VAPID_KEY = { publicKey: `B${'x'.repeat(86)}` };
