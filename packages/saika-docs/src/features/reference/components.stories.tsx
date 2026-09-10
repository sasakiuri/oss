// SPDX-License-Identifier: MIT
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClientProvider } from '@tanstack/react-query';
import { expect, userEvent, within } from 'storybook/test';

import { createQueryClient } from '@/shared/config/query';

import { ComponentExamples } from './components';

const meta = {
  title: 'Reference/Components',
  component: ComponentExamples,
  decorators: [
    (Story) => (
      <QueryClientProvider client={createQueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof ComponentExamples>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Interactive: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: /名前/ }), 'Saika');
    await userEvent.click(canvas.getByRole('button', { name: '保存' }));
    await expect(await canvas.findByText(/入力を受け付けました/)).toBeVisible();
  },
};
