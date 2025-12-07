'use client';

import * as React from 'react';
import { Facebook, Share2, Twitter, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { siteConfig } from '@/lib/config';
import { HatenaIcon, LineIcon } from '@/components/icons';

interface ShareAction {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  getUrl: (title: string, url: string, twitter: string) => string;
}

const shareActions: ShareAction[] = [
  {
    name: 'Twitter',
    icon: Twitter,
    color: 'bg-[#1DA1F2] hover:bg-[#1a8cd8]',
    getUrl: (title, url, twitter) =>
      `https://twitter.com/share?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}&via=${encodeURIComponent(twitter)}&lang=ja`,
  },
  {
    name: 'Facebook',
    icon: Facebook,
    color: 'bg-[#3b5998] hover:bg-[#344e86]',
    getUrl: (_, url) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    name: 'はてなブックマーク',
    icon: HatenaIcon,
    color: 'bg-[#00A4DE] hover:bg-[#0093c7]',
    getUrl: (title, url) =>
      `https://b.hatena.ne.jp/entry/panel/?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
  },
  {
    name: 'LINE',
    icon: LineIcon,
    color: 'bg-[#00B900] hover:bg-[#00a600]',
    getUrl: (_, url) =>
      `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`,
  },
];

interface SnsShareProps {
  title?: string;
  slug?: string;
}

export function SnsShare({ title, slug }: SnsShareProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const fullTitle = title
    ? `${title} : ${siteConfig.title}`
    : siteConfig.title;
  const url = slug ? `${siteConfig.siteUrl}/${slug}` : siteConfig.siteUrl;

  const handleShare = (action: ShareAction) => {
    window.open(
      action.getUrl(fullTitle, url, siteConfig.social.twitter),
      '_blank'
    );
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2">
      {/* Share actions */}
      <div
        className={cn(
          'flex items-center gap-2 transition-all duration-300',
          isOpen
            ? 'translate-x-0 opacity-100'
            : 'pointer-events-none translate-x-4 opacity-0'
        )}
      >
        {shareActions.map((action) => (
          <button
            key={action.name}
            onClick={() => handleShare(action)}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-110',
              action.color
            )}
            aria-label={action.name}
            title={action.name}
          >
            <action.icon className="h-5 w-5" />
          </button>
        ))}
      </div>

      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500 text-white shadow-lg transition-transform hover:scale-105 hover:bg-amber-600"
        aria-label={isOpen ? '閉じる' : 'SNSで共有'}
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <Share2 className="h-6 w-6" />
        )}
      </button>
    </div>
  );
}
