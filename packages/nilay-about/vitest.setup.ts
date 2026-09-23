import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Unit tests exercise server utilities without Next.js's React server condition.
vi.mock('server-only', () => ({}));

// Never use a developer's external services while running the unit suite.
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.SLACK_WEBHOOK_URL;
delete process.env.MICROCMS_SERVICE_DOMAIN;
delete process.env.MICROCMS_API_KEY;
process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3001';
process.env.LOG_MASKING_SECRET = 'nilay-about-local-test-fixture';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

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

// jsdom has no canvas, so every draw prints a "Not implemented" stack that would bury a real error.
// This stands in for the 2D context, which also lets the drawing run instead of returning early:
// a fault in it is then reported by the test that rendered it.
HTMLCanvasElement.prototype.getContext = vi.fn((type: string) =>
  type === '2d'
    ? {
        arc: vi.fn(),
        beginPath: vi.fn(),
        drawImage: vi.fn(),
        fill: vi.fn(),
        fillRect: vi.fn(),
        fillText: vi.fn(),
        lineTo: vi.fn(),
        moveTo: vi.fn(),
        setLineDash: vi.fn(),
        setTransform: vi.fn(),
        stroke: vi.fn(),
        fillStyle: '',
        font: '',
        lineWidth: 0,
        strokeStyle: '',
        textAlign: '',
        textBaseline: '',
      }
    : null,
) as unknown as typeof HTMLCanvasElement.prototype.getContext;
