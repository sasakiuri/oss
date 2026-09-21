import { ArrowLeft, ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { getArticleNavigation } from '@/lib/content/navigation';

export function ArticleNavigation({ slug }: { slug: string }) {
  const { previous, next } = getArticleNavigation(slug);

  return (
    <nav aria-label="記事の移動" className="mt-10 border-t border-line pt-6 print:hidden">
      <div className="grid gap-3 sm:grid-cols-2">
        {previous && (
          <Link
            href={`/${previous.slug}`}
            rel="prev"
            className="border-b border-line py-4 hover:bg-muted focus-visible:outline-2 focus-visible:outline-brand"
          >
            <span className="mb-2 flex items-center gap-2 text-xs text-subtle">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              前の記事
            </span>
            <span className="text-sm font-medium leading-7 text-ink">{previous.title}</span>
          </Link>
        )}
        {next && (
          <Link
            href={`/${next.slug}`}
            rel="next"
            className="border-b border-line py-4 text-right hover:bg-muted focus-visible:outline-2 focus-visible:outline-brand sm:col-start-2"
          >
            <span className="mb-2 flex items-center justify-end gap-2 text-xs text-subtle">
              次の記事
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="text-sm font-medium leading-7 text-ink">{next.title}</span>
          </Link>
        )}
      </div>
      <Link
        href="/articles"
        className="mt-4 inline-flex min-h-11 items-center rounded-md text-sm text-brand hover:underline focus-visible:outline-2 focus-visible:outline-brand"
      >
        記事一覧へ戻る
      </Link>
    </nav>
  );
}
