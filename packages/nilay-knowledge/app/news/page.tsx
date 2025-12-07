import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumb } from '@/components/breadcrumb';
import { SnsShare } from '@/components/sns-share';
import { getNewsByTag, type NewsItem } from '@/lib/markdown';
import { formatDate } from '@/lib/utils';

const title = '銃・射撃・狩猟ニュース';
const slug = 'news';

export const metadata: Metadata = {
  title,
};

interface NewsListProps {
  title: string;
  newsList: NewsItem[];
}

function NewsList({ title, newsList }: NewsListProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <h2 className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-lg font-bold text-slate-800">
        {title}
      </h2>
      <ul className="divide-y divide-slate-200">
        {newsList.map((news) => (
          <li key={news.slug}>
            <Link
              href={`/news/${news.slug}`}
              className="flex items-start gap-4 px-4 py-3 hover:bg-slate-50"
            >
              <time className="shrink-0 text-sm text-slate-500">
                {formatDate(news.frontmatter.published)}
              </time>
              <span className="text-blue-600">{news.frontmatter.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function NewsPage() {
  const incidentNews = await getNewsByTag('事件・事故');
  const lawNews = await getNewsByTag('法令・制度');

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
        <NewsList title="事件・事故" newsList={incidentNews} />
        <NewsList title="法令・制度" newsList={lawNews} />
      </div>
    </>
  );
}
