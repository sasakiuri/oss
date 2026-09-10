// SPDX-License-Identifier: MIT
import type { StorybookConfig } from '@storybook/nextjs-vite';

const config: StorybookConfig = {
  core: { disableTelemetry: true },
  stories: ['../src/**/*.stories.tsx'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-themes'],
  framework: '@storybook/nextjs-vite',
};
export default config;
