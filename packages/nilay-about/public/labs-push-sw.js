/*
 * Nilay Labs notifications. Registered with the scope /labs-push/, where there are no pages, so it
 * only receives pushes and never controls or caches a page (the offline worker is separate).
 */

self.addEventListener('push', (event) => {
  let data = null;
  try {
    data = event.data ? event.data.json() : null;
  } catch {
    data = null;
  }
  const title = data && typeof data.title === 'string' ? data.title : 'Nilay Labs';
  const body = data && typeof data.body === 'string' ? data.body : '';
  const url = data && typeof data.url === 'string' && data.url.startsWith('/') && !data.url.startsWith('//') ? data.url : '/labs';
  const options = { body, data: { url }, lang: 'ja' };
  if (data && typeof data.tag === 'string') {
    options.tag = data.tag;
    options.renotify = true;
  }
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data && event.notification.data.url ? event.notification.data.url : '/labs', self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).pathname === target.pathname);
      return open ? open.focus() : self.clients.openWindow(target.href);
    }),
  );
});
