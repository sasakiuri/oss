import Link from 'next/link';

import { Breadcrumb } from '@/components/breadcrumb';
import { JsonLd } from '@/components/json-ld';
import { SnsShare } from '@/components/sns-share';
import { listContent } from '@/lib/content/server';
import type { ContentSummary } from '@/lib/content/types';
import { createPageMetadata } from '@/lib/metadata';
import { createCollectionSchema } from '@/lib/schema';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-static';

const title = '銃・射撃・狩猟ニュース';
const slug = 'news';
const description =
  '銃・射撃・狩猟に関するニュースの記録。猟銃や空気銃の事件・事故、法令・制度の改正について、発生日や出典とともに掲載しています。';

export const metadata = createPageMetadata({
  title,
  description,
  path: '/news/',
});

interface NewsListProps {
  title: string;
  newsList: ContentSummary[];
}

function NewsList({ title, newsList }: NewsListProps) {
  return (
    <div className="">
      <h2 className="flex items-baseline justify-between gap-4 border-b border-line-strong pb-4 text-lg font-semibold text-ink">
        {title}
        <span className="text-xs font-normal text-subtle">{newsList.length}件</span>
      </h2>
      <ul className="divide-y divide-line">
        {newsList.map((news) => (
          <li key={news.slug}>
            <Link
              href={`/news/${news.slug}`}
              className="group flex flex-col items-start gap-2 -mx-3 px-3 py-5 sm:flex-row sm:gap-6 hover:bg-muted"
            >
              <time
                dateTime={news.frontmatter.published}
                className="shrink-0 text-xs leading-7 text-subtle tabular-nums"
              >
                {formatDate(news.frontmatter.published)}
              </time>
              <span className="leading-7 text-ink underline-offset-4 group-hover:text-brand group-hover:underline">
                {news.frontmatter.title}
              </span>
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
      <JsonLd
        data={createCollectionSchema({ title, description, path: '/news/', articles: [...incidentNews, ...lawNews] })}
      />
      <Breadcrumb
        items={[
          { name: 'トップ', slug: '' },
          { name: title, slug },
        ]}
      />

      <div className="mx-auto max-w-4xl space-y-12 px-5 pt-6 pb-12 sm:px-8 sm:pt-10">
        <header>
          <h1 className="page-title">{title}</h1>
          <p className="mt-3 text-sm leading-7 text-subtle">銃・射撃・狩猟に関する事件・事故、法令・制度の記録。</p>
          <nav aria-label="ニュースの分野" className="mt-6 flex flex-wrap gap-6 text-sm text-brand">
            <a href="#incidents" className="inline-flex min-h-11 items-center underline underline-offset-4">
              事件・事故
            </a>
            <a href="#laws" className="inline-flex min-h-11 items-center underline underline-offset-4">
              法令・制度
            </a>
          </nav>
        </header>
        <section id="incidents" className="scroll-mt-[calc(var(--site-header-height)+1.5rem)]">
          <NewsList title="事件・事故" newsList={incidentNews} />
        </section>
        <section id="laws" className="scroll-mt-[calc(var(--site-header-height)+1.5rem)]">
          <NewsList title="法令・制度" newsList={lawNews} />
        </section>
        <SnsShare title={title} slug={slug} />
      </div>
    </>
  );
}
