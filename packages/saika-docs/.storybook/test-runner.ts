// SPDX-License-Identifier: MIT
import type { TestRunnerConfig } from '@storybook/test-runner';
import { checkA11y, injectAxe } from 'axe-playwright';

const config: TestRunnerConfig = {
  async preVisit(page) {
    await injectAxe(page);
  },
  async postVisit(page) {
    await page.evaluate(() => document.fonts.ready);
    await checkA11y(page, '#storybook-root', { detailedReport: true, detailedReportOptions: { html: true } });
  },
};
export default config;
