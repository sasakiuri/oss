// SPDX-License-Identifier: MIT
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import '@testing-library/react/dont-cleanup-after-each';
import { afterEach, expect, vi } from 'vitest';

import { createMockElectronAPI } from './helpers/mockElectronAPI';

// Add jest-dom matchers individually (using vitest import breaks rejects.toThrow())
// See: https://github.com/vitest-dev/vitest/issues/5285
expect.extend(matchers);

// Registered after the shared setup, so it runs before the shared mock reset.
afterEach(() => {
  cleanup();
});

// Suppress jsdom "Not implemented: HTMLCanvasElement.prototype.getContext" noise
HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;

// Electron API mock exposed by the preload script
const mockElectronAPI = createMockElectronAPI();

Object.defineProperty(window, 'electronAPI', {
  writable: true,
  configurable: true,
  value: mockElectronAPI,
});
