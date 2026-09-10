// SPDX-License-Identifier: MIT
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';

import { Button } from './button';
import { Dialog } from './dialog';

function Example() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      trigger={<Button>文書を検索</Button>}
      title="文書を検索"
      description="キーワードを入力してください"
    >
      <label htmlFor="story-search" className="block text-sm">
        検索キーワード
      </label>
      <input
        id="story-search"
        className="border-line bg-muted mt-2 w-full rounded border p-3"
        placeholder="射座、MQTT、印刷"
      />
    </Dialog>
  );
}
const meta = { title: 'Shared/Dialog', component: Example } satisfies Meta<typeof Example>;
export default meta;
export const Search: StoryObj<typeof meta> = {};
