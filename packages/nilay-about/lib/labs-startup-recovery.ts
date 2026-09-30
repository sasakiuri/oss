/** Runs directly from the initial HTML, before any framework chunk can fail. */
export const labsStartupRecoveryScript = String.raw`(() => {
  if (!location.pathname.startsWith('/labs/')) return;
  const key = 'nilay-labs-startup-retry:' + location.href;
  let failed = false;
  let hydrated = false;
  let reloading = false;
  let complete = false;
  let cancelReload;
  let observer;

  function frameworkAsset(url) {
    return url.origin === location.origin && url.pathname.startsWith('/_next/static/chunks/') && url.pathname.endsWith('.js');
  }

  function reload() {
    if (complete || reloading) return;
    reloading = true;
    const preloads = Array.from(document.querySelectorAll('link[rel="preload"][as="script"]'))
      .map(link => new URL(link.href, location.href)).filter(frameworkAsset);
    if (!preloads.length) return location.reload();
    const controller = new AbortController();
    let finished = false;
    const finish = () => {
      if (finished) return;
      cancelReload();
      if (!complete) location.reload();
    };
    const timer = setTimeout(finish, 5000);
    cancelReload = () => {
      finished = true;
      clearTimeout(timer);
      controller.abort();
    };
    Promise.allSettled(preloads.map(url => fetch(url.href, {
      cache: 'reload', signal: controller.signal,
    }).then(response => response.arrayBuffer()))).then(finish);
  }

  function ready() {
    if (!hydrated || document.readyState === 'loading' || document.querySelector('[aria-busy="true"]')) return;
    complete = true;
    if (cancelReload) cancelReload();
    if (failed) {
      const notice = document.querySelector('[data-labs-startup-failure]');
      const content = document.querySelector('[data-labs-startup-content]');
      if (notice) notice.hidden = true;
      if (content) content.hidden = false;
    }
    window.removeEventListener('error', onError, true);
    window.removeEventListener('nilay-labs-startup-ready', onHydrated);
    if (observer) observer.disconnect();
    try { sessionStorage.removeItem(key); } catch {}
  }

  function showFailure() {
    if (complete) return;
    const notice = document.querySelector('[data-labs-startup-failure]');
    const content = document.querySelector('[data-labs-startup-content]');
    if (!notice) return;
    notice.hidden = false;
    if (content) content.hidden = true;
    const retry = notice.querySelector('button');
    if (retry) retry.onclick = () => {
      try { sessionStorage.removeItem(key); } catch {}
      reload();
    };
  }

  function onError(event) {
    const script = event.target;
    if (failed || !(script instanceof HTMLScriptElement) || !script.src) return;
    const url = new URL(script.src, location.href);
    if (!frameworkAsset(url)) return;
    failed = true;
    let retry = false;
    try {
      if (sessionStorage.getItem(key) === null) {
        sessionStorage.setItem(key, '1');
        retry = sessionStorage.getItem(key) === '1';
      }
    } catch {}
    if (retry) {
      setTimeout(reload, 0);
    } else if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', showFailure, { once: true });
    } else {
      showFailure();
    }
  }

  function onHydrated() {
    hydrated = true;
    ready();
  }

  window.addEventListener('error', onError, true);
  window.addEventListener('nilay-labs-startup-ready', onHydrated);
  observer = new MutationObserver(ready);
  observer.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['aria-busy'] });
  document.addEventListener('DOMContentLoaded', ready, { once: true });
})();`;
