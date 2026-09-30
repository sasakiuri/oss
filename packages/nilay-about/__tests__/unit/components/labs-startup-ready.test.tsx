import { runInNewContext } from 'node:vm';

import { render, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { LabsStartupReady } from '@/components/labs/startup-ready';
import { labsStartupRecoveryScript } from '@/lib/labs-startup-recovery';

it('retires startup recovery after hydration and saved-state readiness without changing saved data', async () => {
  const url = new URL('/labs/unit-converter?unit=m#result', window.location.origin);
  const retryKey = `nilay-labs-startup-retry:${url.href}`;
  const savedKey = 'nilay-labs:unit-converter';
  const reload = vi.fn();
  sessionStorage.setItem(retryKey, '1');
  localStorage.setItem(savedKey, '{"unit":"m","value":12}');

  const shell = document.createElement('div');
  shell.innerHTML =
    '<div data-labs-startup-failure hidden><button>Reload</button></div>' +
    '<div data-labs-startup-content><div aria-busy="true" inert></div></div>';
  document.body.append(shell);

  runInNewContext(labsStartupRecoveryScript, {
    window,
    document,
    location: { href: url.href, pathname: url.pathname, origin: url.origin, reload },
    sessionStorage,
    HTMLScriptElement,
    MutationObserver,
    URL,
    setTimeout,
  });

  const { unmount } = render(<LabsStartupReady />);
  try {
    expect(sessionStorage.getItem(retryKey)).toBe('1');
    shell.querySelector('[aria-busy]')?.setAttribute('aria-busy', 'false');
    await waitFor(() => expect(sessionStorage.getItem(retryKey)).toBeNull());

    const script = document.createElement('script');
    script.src = '/_next/static/chunks/late.js';
    shell.append(script);
    script.dispatchEvent(new Event('error'));
    expect(reload).not.toHaveBeenCalled();
    expect(shell.querySelector<HTMLElement>('[data-labs-startup-failure]')?.hidden).toBe(true);
    expect(localStorage.getItem(savedKey)).toBe('{"unit":"m","value":12}');
  } finally {
    unmount();
    shell.remove();
    sessionStorage.removeItem(retryKey);
    localStorage.removeItem(savedKey);
  }
});
