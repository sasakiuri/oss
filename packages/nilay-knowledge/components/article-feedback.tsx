import { Github, MessageSquare, Pencil } from 'lucide-react';

import { siteConfig } from '@/lib/config';
import type { ContentType } from '@/lib/content/types';

interface ArticleFeedbackProps {
  type: ContentType;
  slug: string;
  title: string;
}

export function ArticleFeedback({ type, slug, title }: ArticleFeedbackProps) {
  const { repository } = siteConfig;
  const sourcePath = `${repository.contentPath}/${type}/${encodeURIComponent(slug)}/index.md`;
  const sourceUrl = `${repository.url}/blob/${repository.branch}/${sourcePath}`;
  const editUrl = `${repository.url}/edit/${repository.branch}/${sourcePath}`;
  const issueUrl = new URL(`${repository.url}/issues/new`);
  issueUrl.searchParams.set('template', '1_generic_report.md');
  issueUrl.searchParams.set('title', `[記事の修正] ${title}`);
  issueUrl.searchParams.set(
    'body',
    `## 対象の記事\n${title}\n${siteConfig.siteUrl}/${type}/${slug}/\n\n元のファイル: ${sourceUrl}\n\n## 修正してほしい箇所\n\n\n## 修正内容・参考資料\n\n`,
  );

  return (
    <aside aria-label="この記事の修正" className="mt-10 border-t border-line pt-5 text-sm print:hidden">
      <p className="flex items-center gap-2 font-medium text-ink">
        <Github className="size-4" aria-hidden="true" />
        この記事の修正
      </p>
      <div className="mt-1 flex flex-wrap gap-x-6">
        <a
          href={issueUrl.toString()}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 text-brand hover:underline"
          aria-label="修正を依頼（Issue・GitHubで新しいタブを開く）"
        >
          <MessageSquare className="size-4" aria-hidden="true" />
          修正を依頼（Issue）
        </a>
        <a
          href={editUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 text-brand hover:underline"
          aria-label="編集して提案（PR・GitHubで新しいタブを開く）"
        >
          <Pencil className="size-4" aria-hidden="true" />
          編集して提案（PR）
        </a>
      </div>
    </aside>
  );
}
