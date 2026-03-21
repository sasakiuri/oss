// SPDX-License-Identifier: MIT
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import '@testing-library/react/dont-cleanup-after-each';
import { afterEach, expect, vi } from 'vitest';

import { createMockElectronAPI } from './helpers/mockElectronAPI';

// Add jest-dom matchers individually (using vitest import breaks rejects.toThrow())
// See: https://github.com/vitest-dev/vitest/issues/5285
expect.extend(matchers);

// Initialize test environment
afterEach(() => {
  // Clean up React Testing Library
  cleanup();
  // Clear mocks after each test
  vi.clearAllMocks();
});

// Electron API type definition (legacy format - direct ipcRenderer)
interface LegacyElectronAPI {
  ipcRenderer: {
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    invoke: ReturnType<typeof vi.fn>;
  };
}

// Global scope type extension
// Note: Window.electronAPI is already declared in src/shared/types/ElectronAPI.ts
declare global {
  var electron: LegacyElectronAPI;
  interface Window {
    electron: LegacyElectronAPI;
  }
}

// Electron API mock (extend as needed)
globalThis.electron = {
  // Mock IPC API for communication with Main Process
  ipcRenderer: {
    on: vi.fn(),
    off: vi.fn(),
    send: vi.fn(),
    invoke: vi.fn(),
  },
};

// Window API extension (mock Electron-specific APIs)
Object.defineProperty(window, 'electron', {
  writable: true,
  value: globalThis.electron,
});

// Suppress jsdom "Not implemented: HTMLCanvasElement.prototype.getContext" noise
HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;

// Electron API mock (new format via preload)
const mockElectronAPI = createMockElectronAPI();

Object.defineProperty(window, 'electronAPI', {
  writable: true,
  configurable: true,
  value: mockElectronAPI,
});
