'use client';

import { ArrowUpRight, ChevronUp, Facebook, Github, Instagram, Rss, Twitter, Youtube } from 'lucide-react';
import Link from 'next/link';

import { siteConfig } from '@/lib/config';

const socialLinks = [
  {
    href: `https://twitter.com/${siteConfig.social.twitter}`,
    label: 'Twitter',
    icon: Twitter,
  },
  {
    href: `https://www.facebook.com/${siteConfig.social.facebook}`,
    label: 'Facebook',
    icon: Facebook,
  },
  {
    href: `https://www.youtube.com/channel/${siteConfig.social.youtube}`,
    label: 'YouTube',
    icon: Youtube,
  },
  {
    href: `https://www.instagram.com/${siteConfig.social.instagram}`,
    label: 'Instagram',
    icon: Instagram,
  },
  {
    href: `https://github.com/${siteConfig.social.github}`,
    label: 'GitHub',
    icon: Github,
  },
];

const services = [
  {
    href: siteConfig.service.ecommerce,
    title: '通信販売',
    description: '射撃・狩猟・鳥獣被害対策用品を販売しています。',
  },
  {
    href: siteConfig.service.gunman,
    title: 'Gunman',
    description: '申請・申込書の作成、火薬類管理サービスを提供しています。',
  },
  {
    href: siteConfig.service.about,
    title: 'About',
    description: 'お知らせの掲載、試験的なツールの公開をしています。',
  },
];

const contents = [
  { href: '/', title: 'トップページ' },
  { href: '/articles/1597956932', title: '申請・申込書' },
  { href: '/articles', title: '記事一覧' },
  { href: '/about', title: '案内所' },
];

interface FooterProps {
  slug?: string;
  publishYear?: number;
}

export function Footer({ slug = '', publishYear }: FooterProps) {
  const currentYear = publishYear || new Date().getFullYear();

  const handleScrollToTop = () => {
    document.getElementById('site-header')?.focus({ preventScroll: true });
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  };

  return (
    <footer className="mt-16 border-t border-line bg-muted text-body [overflow-anchor:none] [overflow-wrap:anywhere] print:mt-8 print:bg-white print:text-black">
      <div className="site-container py-10 print:hidden">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.5fr)] lg:gap-16">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link
              href="/"
              className="inline-flex min-h-11 max-w-full items-center font-editorial text-2xl text-ink hover:text-brand"
            >
              Nilay / Knowledge
            </Link>
            <p className="mt-2 text-xs leading-7 text-subtle">銃砲・射撃・狩猟の情報サイト</p>
            <nav aria-label="ソーシャルメディア" className="mt-4 flex flex-wrap gap-1">
              {socialLinks.map((social) => (
                <a
                  key={social.href}
                  href={social.href}
                  className="flex h-11 w-11 items-center justify-center rounded-sm text-subtle hover:bg-muted-strong hover:text-ink"
                  aria-label={social.label}
                >
                  <social.icon className="h-4 w-4" aria-hidden="true" />
                </a>
              ))}
              <Link
                href="/feed.xml"
                className="flex h-11 w-11 items-center justify-center rounded-sm text-subtle hover:bg-muted-strong hover:text-ink"
                aria-label="RSS Feed"
              >
                <Rss className="h-4 w-4" aria-hidden="true" />
              </Link>
            </nav>
          </div>
          <nav aria-label="フッターナビゲーション">
            <h2 className="mb-3 text-xs font-semibold text-ink">サイト内のご案内</h2>
            <ul>
              {contents.map((content) => (
                <li key={content.href}>
                  <Link
                    href={content.href}
                    className="inline-flex min-h-11 items-center text-sm hover:text-brand hover:underline"
                  >
                    {content.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div>
            <h2 className="mb-3 text-xs font-semibold text-ink">Nilay のサービス</h2>
            <ul className="space-y-3">
              {services.map((service) => (
                <li key={service.href}>
                  <a
                    href={service.href}
                    className="inline-flex min-h-11 items-center gap-2 text-sm hover:text-brand hover:underline"
                  >
                    {service.title}
                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                  </a>
                  <p className="text-xs leading-6 text-subtle">{service.description}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div className="site-container border-t border-line py-5 print:px-0">
        <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-4">
          <div className="max-w-3xl text-xs leading-6 text-subtle print:text-black">
            <p>
              特に表示のない限り、このウェブサイトの文章を「
              <a
                href="https://creativecommons.org/licenses/by-sa/4.0/deed.ja"
                className="underline underline-offset-2 hover:text-ink"
              >
                クリエイティブ・コモンズ 表示-継承 4.0 国際 ライセンス
              </a>
              」の下で公開しています。
            </p>
            <p className="mt-2" suppressHydrationWarning>
              &copy; {currentYear}{' '}
              <a href={`${siteConfig.siteUrl}/${slug}`} className="underline underline-offset-2 hover:text-ink">
                {siteConfig.title}
              </a>
            </p>
          </div>
          <button
            type="button"
            onClick={handleScrollToTop}
            className="inline-flex min-h-11 items-center gap-2 text-xs text-subtle hover:text-brand print:hidden"
          >
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
            <span>トップへ戻る</span>
          </button>
        </div>
      </div>
    </footer>
  );
}
