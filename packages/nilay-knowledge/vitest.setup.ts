import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect, vi } from 'vitest';

// Extend this workspace's Vitest instance when dependencies are hoisted.
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Browser mocks are unnecessary for repository and CLI tests in the Node environment.
if (typeof window !== 'undefined') {
  // jsdom has no top layer; its selector engine recurses for Floating UI's :modal check.
  // Keep real Radix positioning and interaction code in tests, with native behavior covered by Playwright.
  const originalMatches = Element.prototype.matches;
  Element.prototype.matches = function (selector) {
    return selector === ':modal' ? false : originalMatches.call(this, selector);
  };

  HTMLElement.prototype.scrollIntoView = vi.fn();
  // Mock window.matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Mock ResizeObserver
  global.ResizeObserver = vi.fn().mockImplementation(function () {
    return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
  });

  // Mock IntersectionObserver
  global.IntersectionObserver = vi.fn().mockImplementation(function () {
    return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
  });
}
