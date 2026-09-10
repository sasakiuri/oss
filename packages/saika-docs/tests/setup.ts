// SPDX-License-Identifier: MIT
import * as matchers from '@testing-library/jest-dom/matchers';
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';

// Bind matchers to this workspace's Vitest, not the Electron workspaces' hoisted version.
expect.extend(matchers);
declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Module augmentation extends the workspace matcher contract.
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> extends TestingLibraryMatchers<
    R,
    T
  > {}
}

afterEach(cleanup);
