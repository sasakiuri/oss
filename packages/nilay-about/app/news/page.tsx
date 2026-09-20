import type { Metadata } from 'next';

import { NewsListClient } from './news-list-client';

export const metadata: Metadata = {
  title: 'お知らせ',
  description: 'Nilay からのお知らせです。商品の入荷情報やアップデート情報をお届けします。',
};

export default function NewsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1>お知らせ (News)</h1>
      <p>Nilay からの最新情報です。商品の入荷情報やサービスのアップデート情報をお届けします。</p>
      <hr />
      <NewsListClient />
    </div>
  );
}
