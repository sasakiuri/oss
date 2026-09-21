import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { Breadcrumb } from '@/components/breadcrumb';
import { HomeSearchButton } from '@/components/search-dialog';
import { SnsShare } from '@/components/sns-share';
import { TitleText } from '@/components/title-text';
import { createWebSiteSchema } from '@/lib/schema';

export const dynamic = 'force-static';

interface MainCardProps {
  title: string;
  description: string;
  image: string;
  slug: string;
}

function MainCard({ title, description, image, slug }: MainCardProps) {
  return (
    <Link
      href={`/${slug}`}
      className="group block h-full overflow-hidden rounded-lg bg-surface shadow transition-shadow hover:shadow-md"
    >
      <div className="grid">
        <Image
          src={image}
          alt=""
          width={370}
          height={247}
          className="col-start-1 row-start-1 aspect-[3/2] h-full w-full object-cover"
          sizes="(min-width: 768px) 230px, (min-width: 640px) calc((100vw - 80px) / 3), calc(100vw - 32px)"
        />
        <div className="relative col-start-1 row-start-1 self-end bg-slate-900/90 p-4">
          <h2 className="text-lg font-bold text-white">
            <TitleText>{title}</TitleText>
          </h2>
        </div>
      </div>
      <p className="p-4 leading-relaxed text-body">{description}</p>
      <div className="flex items-center justify-between border-t border-line p-4 text-subtle">
        <span>記事を見る</span>
        <ArrowRight aria-hidden="true" className="h-5 w-5 transition-transform group-hover:translate-x-1" />
      </div>
    </Link>
  );
}

interface SubCardProps {
  title: string;
  image: string;
  slug: string;
}

function SubCard({ title, image, slug }: SubCardProps) {
  return (
    <Link
      href={`/${slug}`}
      className="group block overflow-hidden rounded-lg bg-surface shadow transition-shadow hover:shadow-md"
    >
      <div className="grid">
        <Image
          src={image}
          alt=""
          width={370}
          height={247}
          sizes="(min-width: 768px) 235px, (min-width: 640px) calc((100vw - 64px) / 3), calc((100vw - 48px) / 2)"
          className="col-start-1 row-start-1 aspect-[3/2] h-full w-full object-cover"
        />
        <div className="relative col-start-1 row-start-1 flex items-center justify-center bg-slate-900/80 px-3 py-4">
          <span className="text-lg font-bold text-white">
            <TitleText>{title}</TitleText>
          </span>
        </div>
      </div>
    </Link>
  );
}

function SearchBanner() {
  return (
    <div className="relative isolate flex min-h-[300px] flex-col items-center justify-center text-slate-900">
      <Image
        src="/content/assets/63141dde-f6ee-490c-b283-69b468b80813.jpg"
        alt=""
        fill
        sizes="100vw"
        preload
        fetchPriority="high"
        quality={65}
        className="-z-10 object-cover"
      />
      <p className="rounded bg-surface/95 px-3 py-1 text-sm text-ink">銃砲・射撃・狩猟の情報サイト</p>
      <h1 className="mt-2 rounded bg-surface/95 px-3 py-2 text-3xl font-bold text-ink [font-variant:small-caps]">
        Nilay/Knowledge
      </h1>
      <div className="w-full max-w-md px-4">
        <HomeSearchButton />
      </div>
    </div>
  );
}

function WebSiteSchemaScript() {
  const jsonLd = createWebSiteSchema();

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />;
}

export default function HomePage() {
  const mainCards: MainCardProps[] = [
    {
      title: '銃を手に入れる',
      description: '国内で所持許可（免許）を取得し、銃を入手する方法を紹介します。',
      image: '/content/assets/87c2ff6b-8370-4d37-a1c6-422f2fac3ed0.jpg',
      slug: 'articles/1378038316',
    },
    {
      title: '狩猟を始める',
      description: '銃・わな・網の狩猟免許の取得方法や免許の種類について紹介します。',
      image: '/content/assets/574b2804-3546-4dca-bd9c-a1f48406fd87.jpg',
      slug: 'articles/1403944258',
    },
    {
      title: '射撃を始める',
      description: 'クレー射撃、空気銃・ライフル射撃の始め方を紹介します。',
      image: '/content/assets/343de306-e838-4c10-9e27-d89d05c8c8da.jpg',
      slug: 'articles/1403944258',
    },
  ];

  const subCards: SubCardProps[] = [
    {
      title: '申請書類',
      image: '/content/assets/95caff24-d107-48a1-8989-23134cf60ec9.jpg',
      slug: 'articles/1597956932',
    },
    {
      title: '記事一覧',
      image: '/content/assets/8e2ba4c1-9366-4f91-91ca-d7b96b912a16.jpg',
      slug: 'articles',
    },
    {
      title: '狩猟鳥獣図鑑',
      image: '/content/assets/308e5010-683e-498b-9669-07e9808bdb1f.jpg',
      slug: 'articles/1403693668',
    },
  ];

  return (
    <>
      <WebSiteSchemaScript />
      <Breadcrumb items={[{ name: 'トップ', slug: '' }]} showNav={false} />
      <SnsShare />
      <SearchBanner />

      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Main cards */}
        <div className="grid gap-6 sm:grid-cols-3">
          {mainCards.map((card, index) => (
            <MainCard key={`main-${index}`} {...card} />
          ))}
        </div>

        {/* Sub cards */}
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {subCards.map((card) => (
            <SubCard key={card.slug} {...card} />
          ))}
        </div>
      </div>
    </>
  );
}
