import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { JsonLd } from '@/components/json-ld';
import { HomeSearchButton } from '@/components/search-dialog';
import { SnsShare } from '@/components/sns-share';
import { TitleText } from '@/components/title-text';
import { siteConfig } from '@/lib/config';
import { articleCategoryHref } from '@/lib/content/category-pages';
import { listContent } from '@/lib/content/server';
import { createArticleDirectory, getDirectoryCategories } from '@/lib/content/taxonomy';
import { createPageMetadata } from '@/lib/metadata';
import { createWebSiteSchema } from '@/lib/schema';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-static';

export const metadata = createPageMetadata({
  title: '銃・射撃・狩猟の情報サイト',
  description: siteConfig.description,
  path: '/',
});

const guides = [
  {
    title: '銃を手に入れる',
    description: '所持許可の取得から、銃を受け取るまでの手順。',
    image: '/content/assets/87c2ff6b-8370-4d37-a1c6-422f2fac3ed0.jpg',
    slug: '1378038316',
  },
  {
    title: '狩猟を始める',
    description: '狩猟免許の種類と、試験・申請の進め方。',
    image: '/content/assets/574b2804-3546-4dca-bd9c-a1f48406fd87.jpg',
    slug: '1403944258',
  },
  {
    title: '射撃を始める',
    description: 'クレー射撃の種目と、トラップ・スキートの基本。',
    image: '/content/assets/343de306-e838-4c10-9e27-d89d05c8c8da.jpg',
    slug: '1404015637',
  },
];

const resources = [
  { title: '申請書類', description: '銃・火薬・狩猟の申請書と申込書', slug: '1597956932' },
  { title: '許可の更新', description: '所持許可の更新手順と必要書類', slug: '1403250921' },
  { title: '狩猟鳥獣図鑑', description: '鳥獣の特徴と見分け方', slug: '1403693668' },
  { title: '射撃場を探す', description: '関東地方の射撃場一覧', slug: '1413972696' },
];

export default async function HomePage() {
  const news = (await listContent('news')).slice(0, 3);
  const articles = createArticleDirectory(await listContent('articles'));
  const categories = getDirectoryCategories(articles);

  return (
    <>
      <JsonLd data={createWebSiteSchema()} />
      <div className="site-container pb-8">
        <section className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-line py-6">
          <div className="min-w-0">
            <p className="mb-1 text-xs text-subtle">
              <TitleText>銃砲・射撃・狩猟の情報サイト</TitleText>
            </p>
            <h1 className="font-editorial text-2xl leading-normal text-ink sm:text-3xl">
              Nilay/
              <wbr />
              Knowledge
            </h1>
          </div>
          <Image
            src="/content/assets/63141dde-f6ee-490c-b283-69b468b80813.jpg"
            alt="草地にいるタヌキ"
            width={720}
            height={480}
            sizes="(min-width: 640px) 200px, 104px"
            preload
            className="col-start-2 row-start-1 aspect-[3/2] w-[104px] object-cover sm:row-span-2 sm:w-[200px]"
          />
          <div className="col-span-2 sm:col-span-1">
            <HomeSearchButton compact />
          </div>
        </section>

        <section aria-labelledby="guides-heading" className="py-6">
          <h2 id="guides-heading" className="section-title mb-4">
            はじめての方へ
          </h2>
          <div className="grid gap-4 sm:grid-cols-3 sm:gap-8">
            {guides.map((guide) => (
              <Link
                key={guide.slug}
                href={`/articles/${guide.slug}`}
                className="group grid grid-cols-[minmax(0,1fr)_minmax(0,3fr)] items-center gap-4 sm:block"
              >
                <Image
                  src={guide.image}
                  alt=""
                  width={370}
                  height={247}
                  sizes="(min-width: 1152px) 341px, (min-width: 640px) calc((100vw - 128px) / 3), 25vw"
                  className="aspect-square w-full object-cover sm:aspect-[2/1]"
                />
                <div className="sm:mt-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base leading-7 font-semibold text-ink underline-offset-4 group-hover:underline group-focus-visible:underline">
                      <TitleText>{guide.title}</TitleText>
                    </h3>
                    <ArrowRight className="size-4 shrink-0 text-subtle" aria-hidden="true" />
                  </div>
                  <p className="mt-1 text-sm leading-6 text-subtle">{guide.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="resources-heading"
          className="grid gap-4 border-t border-line py-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12"
        >
          <h2 id="resources-heading" className="section-title">
            手続き・資料を探す
          </h2>
          <div className="grid sm:grid-cols-2 sm:gap-x-10">
            {resources.map((resource) => (
              <Link
                key={resource.slug}
                href={`/articles/${resource.slug}`}
                className="group flex items-center justify-between gap-4 border-b border-line py-4 first:pt-0 sm:[&:nth-child(2)]:pt-0"
              >
                <div>
                  <h3 className="font-medium leading-7 text-brand underline-offset-4 group-hover:underline">
                    <TitleText>{resource.title}</TitleText>
                  </h3>
                  <p className="mt-1 text-xs leading-6 text-subtle">{resource.description}</p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-subtle" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>

        <div className="grid gap-10 border-t border-line pt-8 sm:pt-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-16">
          <section aria-labelledby="news-heading">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2">
              <h2 id="news-heading" className="section-title">
                ニュース
              </h2>
              <Link href="/news" className="inline-flex min-h-11 items-center gap-2 text-xs text-brand hover:underline">
                ニュース一覧 <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <ul className="divide-y divide-line">
              {news.map((item) => (
                <li key={item.slug}>
                  <Link href={`/news/${item.slug}`} className="group flex flex-col gap-1 py-4 sm:flex-row sm:gap-5">
                    <time
                      dateTime={item.frontmatter.published}
                      className="shrink-0 text-xs leading-7 text-subtle tabular-nums"
                    >
                      {formatDate(item.frontmatter.published)}
                    </time>
                    <span className="text-sm leading-7 text-ink underline-offset-4 group-hover:underline">
                      <TitleText>{item.frontmatter.title}</TitleText>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <nav aria-label="分野から探す" className="self-start lg:border-l lg:border-line lg:pl-8">
            <h2 className="section-title mb-3">分野から探す</h2>
            <ul className="grid grid-cols-2 gap-x-6 lg:grid-cols-1">
              {categories.map((category) => (
                <li key={category.id}>
                  <Link
                    href={articleCategoryHref(articles, category.id)}
                    className="flex min-h-11 items-center justify-between gap-3 text-sm text-body hover:text-brand hover:underline"
                  >
                    {category.title}
                    <span className="text-xs text-faint tabular-nums">
                      {articles.filter((article) => article.category.id === category.id).length}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <SnsShare />
      </div>
    </>
  );
}
