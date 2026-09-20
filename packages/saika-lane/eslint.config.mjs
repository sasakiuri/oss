// SPDX-License-Identifier: MIT
import eslintConfig from '@sasakiuri/eslint-config';
import testingLibrary from '@sasakiuri/eslint-config/testing-library';
import vitest from '@sasakiuri/eslint-config/vitest';

export default [...eslintConfig, vitest, { ...testingLibrary, files: ['tests/unit/renderer/**/*.test.{ts,tsx}'] }];
