/** Reveal and focus a reading destination, including sections inside closed details. */
export function focusContent(hash = '') {
  let target: HTMLElement | null = null;
  if (hash) {
    try {
      target = document.getElementById(decodeURIComponent(hash.replace(/^#/, '')));
    } catch {
      // An invalid URL fragment must not interrupt navigation to the page itself.
    }
  }
  target ??= document.querySelector<HTMLElement>('#main-content h1') ?? document.getElementById('main-content');
  if (!target) return;
  for (let parent = target.parentElement; parent; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  }
  if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'start', behavior: 'instant' });
}
