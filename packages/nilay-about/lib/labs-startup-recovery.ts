/** Runs directly from the initial HTML, before any framework chunk can fail. */
export const labsStartupRecoveryScript = String.raw`(() => {
  if (!location.pathname.startsWith('/labs/')) return;
  const key = 'nilay-labs-startup-retry:' + location.href;
  let failed = false;
  let hydrated = false;
  let observer;

  function ready() {
    if (!hydrated || document.readyState === 'loading' || document.querySelector('[aria-busy="true"]')) return;
    window.removeEventListener('error', onError, true);
    window.removeEventListener('nilay-labs-startup-ready', onHydrated);
    if (observer) observer.disconnect();
    try { sessionStorage.removeItem(key); } catch {}
  }

  function showFailure() {
    const notice = document.querySelector('[data-labs-startup-failure]');
    const content = document.querySelector('[data-labs-startup-content]');
    if (!notice) return;
    notice.hidden = false;
    if (content) content.hidden = true;
    const retry = notice.querySelector('button');
    if (retry) retry.onclick = () => {
      try { sessionStorage.removeItem(key); } catch {}
      location.reload();
    };
  }

  function onError(event) {
    const script = event.target;
    if (failed || !(script instanceof HTMLScriptElement) || !script.src) return;
    const url = new URL(script.src, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/_next/static/chunks/') || !url.pathname.endsWith('.js')) return;
    failed = true;
    let retry = false;
    try {
      if (sessionStorage.getItem(key) === null) {
        sessionStorage.setItem(key, '1');
        retry = sessionStorage.getItem(key) === '1';
      }
    } catch {}
    if (retry) {
      setTimeout(() => location.reload(), 0);
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
