import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Search } from 'lucide-react';
import { Breadcrumb } from '@/components/breadcrumb';
import { SnsShare } from '@/components/sns-share';
import { createWebSiteSchema } from '@/lib/schema';

interface MainCardProps {
  title: string;
  description: string;
  image: string;
  slug: string;
}

function MainCard({
  title,
  description,
  image,
  slug,
  priority = false,
}: MainCardProps & { priority?: boolean }) {
  return (
    <Link
      href={`/${slug}`}
      className="group block h-full overflow-hidden rounded-lg bg-white shadow transition-shadow hover:shadow-md"
    >
      <div className="relative">
        <Image
          src={image}
          alt={`${title}の画像`}
          width={370}
          height={247}
          className="aspect-[3/2] w-full object-cover"
          priority={priority}
        />
        <div className="absolute bottom-0 left-0 p-4">
          <h3 className="text-lg font-bold text-white [text-shadow:1px_1px_0_#666,-1px_-1px_0_#666,-1px_1px_0_#666,1px_-1px_0_#666]">
            {title}
          </h3>
        </div>
      </div>
      <p className="p-4 leading-relaxed text-slate-700">{description}</p>
      <div className="flex items-center justify-between border-t border-slate-200 p-4 text-slate-600">
        <span>記事を見る</span>
        <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
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
      className="group block overflow-hidden rounded-lg bg-white shadow transition-shadow hover:shadow-md"
    >
      <div className="relative">
        <Image
          src={image}
          alt={`${title}の画像`}
          width={370}
          height={247}
          className="aspect-[3/2] w-full object-cover"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <span className="text-lg font-bold text-white">{title}</span>
        </div>
      </div>
    </Link>
  );
}

function SearchBanner() {
  return (
    <div
      className="relative flex min-h-[300px] flex-col items-center justify-center bg-cover bg-center"
      style={{
        backgroundImage:
          'url(/content/assets/63141dde-f6ee-490c-b283-69b468b80813.jpg)',
      }}
    >
      <p className="text-sm [text-shadow:1px_1px_0_#fff,-1px_1px_0_#fff]">
        銃砲・射撃・狩猟の情報サイト
      </p>
      <h1 className="mt-2 text-3xl font-bold [font-variant:small-caps] [text-shadow:1px_1px_0_#fff,-1px_1px_0_#fff]">
        Nilay/Knowledge
      </h1>
      <form
        action="https://www.google.com/search"
        className="mt-4 w-full max-w-md px-4"
      >
        <input type="hidden" name="hl" value="ja" />
        <input type="hidden" name="ie" value="utf-8" />
        <input type="hidden" name="oe" value="utf-8" />
        <input type="hidden" name="as_sitesearch" value="knowledge.nilay.jp" />
        <div className="relative">
          <input
            type="text"
            name="q"
            placeholder="サイト内検索"
            aria-label="サイト内検索"
            className="w-full rounded-full bg-white/60 py-2 pl-4 pr-10 text-center text-slate-800 placeholder:text-slate-600 focus:bg-white focus:outline-none"
          />
          <button
            type="submit"
            name="btnG"
            aria-label="検索する"
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full p-2 hover:bg-black/10"
          >
            <Search className="h-5 w-5 text-slate-700" />
          </button>
        </div>
      </form>
    </div>
  );
}

function WebSiteSchemaScript() {
  const jsonLd = createWebSiteSchema();

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export default function HomePage() {
  const mainCards: MainCardProps[] = [
    {
      title: '銃を手に入れる',
      description:
        '国内で所持許可（免許）を取得し、銃を入手する方法を紹介します。',
      image: '/content/assets/87c2ff6b-8370-4d37-a1c6-422f2fac3ed0.jpg',
      slug: 'articles/1378038316',
    },
    {
      title: '狩猟を始める',
      description:
        '銃・わな・網の狩猟免許の取得方法や免許の種類について紹介します。',
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
            <MainCard key={card.slug} {...card} priority={index === 0} />
          ))}
        </div>

        {/* Sub cards */}
        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {subCards.map((card) => (
            <SubCard key={card.slug} {...card} />
          ))}
        </div>
      </div>
    </>
  );
}
