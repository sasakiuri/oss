import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { NavigationFocus } from '@/components/navigation-focus';

const route = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));

function Page() {
  return (
    <>
      <button>ナビゲーション</button>
      <NavigationFocus />
      <main id="main-content" tabIndex={-1}>
        <h1>{route.pathname}</h1>
        <details>
          <summary>補足</summary>
          <h2 id="section">節</h2>
        </details>
      </main>
    </>
  );
}

beforeEach(() => {
  route.pathname = '/';
  window.history.replaceState(null, '', '/');
});

afterEach(() => vi.restoreAllMocks());

it('leaves initial page focus alone and focuses the title after client navigation', async () => {
  const { rerender } = render(<Page />);
  const opener = screen.getByRole('button');
  opener.focus();
  rerender(<Page />);
  expect(opener).toHaveFocus();
  route.pathname = '/articles/example/';
  rerender(<Page />);
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());
});

it('reveals and focuses a fragment in the destination instead of its title', async () => {
  const { rerender } = render(<Page />);
  window.history.pushState(null, '', '/articles/example/#section');
  route.pathname = '/articles/example/';
  rerender(<Page />);
  await waitFor(() => expect(screen.getByRole('heading', { name: '節' })).toHaveFocus());
  expect(document.querySelector('details')).toHaveAttribute('open');
});

it('preserves focus on history navigation and resumes title focus for ordinary navigation', async () => {
  const { rerender } = render(<Page />);
  const opener = screen.getByRole('button');
  opener.focus();
  fireEvent(window, new PopStateEvent('popstate'));
  route.pathname = '/previous/';
  rerender(<Page />);
  expect(opener).toHaveFocus();
  // A same-page history entry must not suppress the next clicked page link.
  fireEvent(window, new PopStateEvent('popstate'));
  fireEvent.click(opener);
  route.pathname = '/next/';
  rerender(<Page />);
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());
});

it('cancels a pending focus change when the navigation component unmounts', () => {
  const schedule = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(42);
  const cancel = vi.spyOn(window, 'cancelAnimationFrame');
  const { rerender, unmount } = render(<Page />);
  route.pathname = '/next/';
  rerender(<Page />);
  expect(schedule).toHaveBeenCalled();
  unmount();
  expect(cancel).toHaveBeenCalledWith(42);
});
