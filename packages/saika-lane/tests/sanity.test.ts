// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

describe('Test Infrastructure', () => {
  it('should run tests successfully', () => {
    expect(true).toBe(true);
  });

  it('should have access to global test utilities', () => {
    expect(expect).toBeDefined();
    expect(describe).toBeDefined();
    expect(it).toBeDefined();
  });

  it('should have Electron API mocked', () => {
    expect(globalThis.electron).toBeDefined();
    expect(globalThis.electron.ipcRenderer).toBeDefined();
    expect(window.electron).toBeDefined();
  });
});
