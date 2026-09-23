'use client';

import { useLanguage } from '@/store';

/** The heading and the line under it, shared by the page and by what it shows while loading. */
export function NewsHeading() {
  const language = useLanguage();

  return (
    <>
      <h1>{language === 'ja' ? 'お知らせ (News)' : 'News'}</h1>
      <p>
        {language === 'ja'
          ? 'Nilay からの最新情報です。商品の入荷情報やサービスのアップデート情報をお届けします。'
          : 'The latest from Nilay: what has come into stock, and what has changed in the services. The items themselves are written in Japanese.'}
      </p>
    </>
  );
}
