// SPDX-License-Identifier: MIT
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { parseDocument } from '@/entities/document/parse';
import { DocumentMarkdown } from '@/features/reading/markdown';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';

describe('Markdown renderer', () => {
  it('renders GFM tables, code, math, and links while removing executable HTML', () => {
    const document = parseDocument(
      'lane/README.md',
      '# 操作\n\n## 1. 接続\n\n[入口](../README.md)\n\n| 項目 | 値 |\n| --- | --- |\n| 得点 | 10 |\n\n```json\n{"score":10}\n```\n\n$x^2$\n\n> [!NOTE]\n> 接続を確認します。\n\n<script>alert(1)</script><img src="x" onerror="alert(2)">',
    );
    const html = renderToStaticMarkup(<DocumentMarkdown document={document} />);
    expect(html).toContain('<table>');
    expect(html).toContain('id="1-接続"');
    expect(html).toContain('href="/"');
    expect(html).toContain('katex');
    expect(html).not.toContain('katex-display');
    expect(html).toContain('markdown-alert-note');
    expect(html).toContain('class="heading-anchor"');
    expect(html).toContain('aria-label="見出しへのリンク"');
    expect(html).toContain('hljs');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('onerror');
  });
});

it('opens a dialog, focuses its contents, and returns focus on Escape', async () => {
  function Example() {
    const [open, setOpen] = useState(false);
    return (
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="文書を検索"
        description="キーワードを入力します"
        trigger={<Button>検索する</Button>}
      >
        <input aria-label="検索キーワード" />
      </Dialog>
    );
  }
  const user = userEvent.setup();
  render(<Example />);
  const trigger = screen.getByRole('button', { name: '検索する' });
  await user.click(trigger);
  expect(screen.getByRole('dialog', { name: '文書を検索' })).toBeVisible();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

it('renders filenames and provides accessible form errors', async () => {
  const document = parseDocument('README.md', '# Example\n\n```ts:example.ts\nconst value = 1;\n```');
  const html = renderToStaticMarkup(<DocumentMarkdown document={document} />);
  expect(html).toContain('example.ts');
  expect(html).toContain('tabindex="0"');
  const { axe } = await import('jest-axe');
  const { TextField } = await import('@/shared/ui/form');
  const { container } = render(<TextField label="名前" required error="入力してください" />);
  expect((await axe(container)).violations).toEqual([]);
  expect(screen.getByRole('textbox')).toHaveAccessibleDescription('入力してください');
});
