// SPDX-License-Identifier: MIT
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Jest loads this CommonJS configuration directly.
const { getJestConfig } = require('@storybook/test-runner');

module.exports = {
  ...getJestConfig(),
  testEnvironmentOptions: {
    'jest-playwright': {
      launchOptions: {
        args: process.env.PLAYWRIGHT_DISABLE_SOFTWARE_RASTERIZER === '1' ? ['--disable-software-rasterizer'] : [],
      },
    },
  },
};
