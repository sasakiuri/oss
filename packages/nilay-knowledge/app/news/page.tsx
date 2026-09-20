import type { Metadata } from 'next';
import Link from 'next/link';

import { Breadcrumb } from '@/components/breadcrumb';
import { SnsShare } from '@/components/sns-share';
import { listContent } from '@/lib/content/server';
import type { ContentSummary } from '@/lib/content/types';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-static';

const title = '銃・射撃・狩猟ニュース';
const slug = 'news';

export const metadata: Metadata = {
  title,
};

interface NewsListProps {
  title: string;
  newsList: ContentSummary[];
}

function NewsList({ title, newsList }: NewsListProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <h2 className="border-b border-line bg-muted px-4 py-3 text-lg font-bold text-ink">{title}</h2>
      <ul className="divide-y divide-line">
        {newsList.map((news) => (
          <li key={news.slug}>
            <Link
              href={`/news/${news.slug}`}
              className="flex flex-col items-start gap-1 sm:flex-row sm:gap-4 px-4 py-3 hover:bg-muted"
            >
              <time dateTime={news.frontmatter.published} className="shrink-0 text-sm text-subtle">
                {formatDate(news.frontmatter.published)}
              </time>
              <span className="text-brand">{news.frontmatter.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function NewsPage() {
  const news = await listContent('news');
  const incidentNews = news.filter((item) => item.frontmatter.tags.includes('事件・事故'));
  const lawNews = news.filter((item) => item.frontmatter.tags.includes('法令・制度'));

  return (
    <>
      <Breadcrumb
        items={[
          { name: 'トップ', slug: '' },
          { name: title, slug },
        ]}
      />
      <SnsShare title={title} slug={slug} />

      <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        <NewsList title="事件・事故" newsList={incidentNews} />
        <NewsList title="法令・制度" newsList={lawNews} />
      </div>
    </>
  );
}
