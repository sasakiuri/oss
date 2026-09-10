// SPDX-License-Identifier: MIT
'use client';

import { Copy } from 'lucide-react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';

import { Button } from '@/shared/ui/button';

export function CodeBlock({
  source,
  language,
  filename,
  children,
}: {
  source: string;
  language: string;
  filename?: string;
  children: ReactNode;
}) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(source);
      toast.success('コードをコピーしました');
    } catch {
      toast.error('コピーできませんでした。コードを選択してコピーしてください。');
    }
  }
  return (
    <div className="border-line my-6 overflow-hidden rounded-lg border">
      <div className="border-line bg-muted text-subtle flex items-center justify-between border-b px-4 text-xs">
        <span>{filename || language || 'text'}</span>
        <Button variant="ghost" onClick={copy} aria-label="コードをコピー">
          <Copy size={15} aria-hidden="true" />
          コピー
        </Button>
      </div>
      <pre tabIndex={0}>{children}</pre>
    </div>
  );
}
