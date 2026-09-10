// SPDX-License-Identifier: MIT
import { ArrowLeft, ArrowRight, FileCode2 } from 'lucide-react';
import Link from 'next/link';

import type { DocumentRecord } from '@/entities/document/model';
import { site } from '@/shared/config/site';
import { cn } from '@/shared/lib/classes';

import { DocumentMarkdown } from './markdown';

export function DocumentPage({
  document,
  previous,
  next,
}: {
  document: DocumentRecord;
  previous?: DocumentRecord;
  next?: DocumentRecord;
}) {
  const headings = document.headings.filter((heading) => heading.depth === 2 || heading.depth === 3);
  const contents = (
    <ul className="space-y-1 2xl:space-y-3">
      {headings.map((heading) => (
        <li key={heading.id} className={heading.depth === 3 ? 'pl-3' : ''}>
          <a
            href={`#${heading.id}`}
            className="text-subtle hover:text-brand block py-2 text-sm leading-relaxed 2xl:py-0 2xl:text-xs"
          >
            {heading.text}
          </a>
        </li>
      ))}
    </ul>
  );
  return (
    <div
      className={cn(
        'mx-auto grid w-full max-w-[52rem] min-w-0 grid-cols-1 gap-10 2xl:max-w-none 2xl:grid-cols-[minmax(0,1fr)_168px]',
        document.href === '/' && 'document-home',
      )}
    >
      <main id="main-content" className="min-w-0 pb-20" tabIndex={-1}>
        <div className="text-subtle mb-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span>Saika / ドキュメント</span>
          <a
            href={`${site.repository}/blob/${encodeURIComponent(site.sourceRef)}/packages/saika-docs/${document.sourcePath}`}
            target="_blank"
            rel="noreferrer"
            className="border-line hover:bg-muted hover:text-ink inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5"
          >
            <FileCode2 size={14} aria-hidden="true" />
            Markdown を見る
          </a>
        </div>
        {document.href !== '/' && headings.length > 0 && (
          <details className="border-line mb-6 rounded-lg border px-4 py-2 2xl:hidden print:hidden">
            <summary className="cursor-pointer py-2 text-sm font-medium">このページの目次</summary>
            <nav aria-label="このページの目次" className="pb-2">
              {contents}
            </nav>
          </details>
        )}
        <DocumentMarkdown document={document} />
        <nav aria-label="前後の文書" className="border-line mt-14 grid grid-cols-2 gap-4 border-t pt-6">
          {previous ? (
            <Link href={previous.href} className="border-line hover:bg-muted rounded-lg border p-4 transition-colors">
              <span className="text-subtle mb-2 flex items-center gap-2 text-xs">
                <ArrowLeft size={14} aria-hidden="true" />
                前のページ
              </span>
              <span className="text-brand text-sm font-medium">{previous.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link
              href={next.href}
              className="border-line hover:bg-muted rounded-lg border p-4 text-right transition-colors"
            >
              <span className="text-subtle mb-2 flex items-center justify-end gap-2 text-xs">
                次のページ
                <ArrowRight size={14} aria-hidden="true" />
              </span>
              <span className="text-brand text-sm font-medium">{next.title}</span>
            </Link>
          )}
        </nav>
      </main>
      <aside className="hidden 2xl:block">
        <nav
          aria-label="このページの目次"
          className="border-line sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto border-l pl-5"
        >
          <p className="mb-4 text-xs font-semibold">このページの目次</p>
          {contents}
        </nav>
      </aside>
    </div>
  );
}
