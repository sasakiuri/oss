'use client';

import { ChevronUp, Facebook, Github, Instagram, Rss, Twitter, Youtube } from 'lucide-react';
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="mt-16 bg-slate-600 text-white">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="grid gap-8 md:grid-cols-2">
          {/* Services */}
          <div>
            <h3 className="mb-4 text-base font-bold">Services</h3>
            <ul className="space-y-4">
              {services.map((service) => (
                <li key={service.href}>
                  <a
                    href={service.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-white hover:underline"
                  >
                    {service.title}
                  </a>
                  <p className="mt-1 text-xs text-slate-300">{service.description}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Contents */}
          <div>
            <h3 className="mb-4 text-base font-bold">Contents</h3>
            <ul className="space-y-3">
              {contents.map((content) => (
                <li key={content.href}>
                  <Link href={content.href} className="text-white hover:underline">
                    {content.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Social links */}
        <div className="mt-8 flex flex-wrap gap-2">
          {socialLinks.map((social) => (
            <a
              key={social.href}
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full p-2 hover:bg-slate-500"
              aria-label={social.label}
            >
              <social.icon className="h-5 w-5" />
            </a>
          ))}
          <Link href="/feed.xml" className="rounded-full p-2 hover:bg-slate-500" aria-label="RSS Feed">
            <Rss className="h-5 w-5" />
          </Link>
        </div>
      </div>

      {/* License */}
      <div className="bg-slate-700 px-4 py-4">
        <div className="mx-auto max-w-3xl text-xs text-slate-300">
          <p>
            特に表示のない限り、このウェブサイトの文章を「
            <a
              href="https://creativecommons.org/licenses/by-sa/4.0/deed.ja"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-white"
            >
              クリエイティブ・コモンズ 表示-継承 4.0 国際 ライセンス
            </a>
            」の下で公開しています。
          </p>
          <p className="mt-2" suppressHydrationWarning>
            &copy; {currentYear}{' '}
            <a
              href={`${siteConfig.siteUrl}/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-white"
            >
              {siteConfig.title}
            </a>
          </p>
        </div>
      </div>

      {/* Scroll to top */}
      <button
        onClick={handleScrollToTop}
        className="flex w-full items-center justify-center gap-2 bg-slate-800 py-3 text-sm text-white hover:bg-slate-700"
        aria-label="ページの先頭へスクロール"
      >
        <ChevronUp className="h-5 w-5" />
        <span>トップへ戻る</span>
      </button>
    </footer>
  );
}
