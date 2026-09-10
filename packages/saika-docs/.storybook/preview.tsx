// SPDX-License-Identifier: MIT
import '@fontsource-variable/inter';
import '@fontsource-variable/noto-sans-jp';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';
import 'remark-github-blockquote-alert/alert.css';
import { Provider as TooltipProvider } from '@radix-ui/react-tooltip';
import { withThemeByClassName } from '@storybook/addon-themes';
import type { Preview } from '@storybook/nextjs-vite';

import '../src/app/globals.css';

const preview: Preview = {
  parameters: {
    nextjs: { appDirectory: true },
    a11y: { test: 'error' },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
  },
  decorators: [
    withThemeByClassName({ themes: { light: '', dark: 'dark' }, defaultTheme: 'light' }),
    (Story) => (
      <TooltipProvider>
        <div className="bg-surface text-ink min-h-24 p-6">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
  tags: ['autodocs'],
};
export default preview;
