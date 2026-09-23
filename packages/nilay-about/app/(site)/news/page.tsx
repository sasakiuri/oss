import { NewsListClient } from '@/features/news/components/news-list';
import { pageMetadata } from '@/lib/seo';

import { NewsHeading } from './news-heading';

export const metadata = pageMetadata({
  title: 'お知らせ',
  description: 'Nilay からのお知らせ。商品の入荷やサービスの更新をお知らせします。',
  path: '/news',
});

export default function NewsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <NewsHeading />
      <hr />
      <NewsListClient />
    </div>
  );
}
