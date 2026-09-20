'use client';

import { Facebook, Share2, Twitter, X } from 'lucide-react';
import * as React from 'react';

import { HatenaIcon, LineIcon } from '@/components/icons';
import { siteConfig } from '@/lib/config';
import { cn } from '@/lib/utils';

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
    color: 'bg-[#006DB0] hover:bg-[#005b94]',
    getUrl: (title, url, twitter) =>
      `https://twitter.com/share?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}&via=${encodeURIComponent(twitter)}&lang=ja`,
  },
  {
    name: 'Facebook',
    icon: Facebook,
    color: 'bg-[#3b5998] hover:bg-[#344e86]',
    getUrl: (_, url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    name: 'はてなブックマーク',
    icon: HatenaIcon,
    color: 'bg-[#007EA8] hover:bg-[#006b8f]',
    getUrl: (title, url) =>
      `https://b.hatena.ne.jp/entry/panel/?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
  },
  {
    name: 'LINE',
    icon: LineIcon,
    color: 'bg-[#187D25] hover:bg-[#12651d]',
    getUrl: (_, url) => `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`,
  },
];

interface SnsShareProps {
  title?: string;
  slug?: string;
}

export function SnsShare({ title, slug }: SnsShareProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const panelId = React.useId();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const fullTitle = title ? `${title} : ${siteConfig.title}` : siteConfig.title;
  const url = slug ? `${siteConfig.siteUrl}/${slug}` : siteConfig.siteUrl;

  React.useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        if (containerRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  return (
    <div
      ref={containerRef}
      className="fixed bottom-[16px] right-[16px] z-50 flex max-w-[calc(100vw-32px)] flex-row-reverse items-center gap-[8px] print:hidden"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
      }}
      onKeyDown={(event) => {
        if (isOpen && event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          setIsOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      {/* Keep the trigger first in the tab order so the next Tab reaches the share links. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-full bg-amber-500 text-slate-950 shadow-lg transition-transform hover:scale-105 hover:bg-amber-400"
        aria-label="SNSで共有"
        aria-expanded={isOpen}
        aria-controls={panelId}
      >
        {isOpen ? (
          <X className="size-[24px]" aria-hidden="true" />
        ) : (
          <Share2 className="size-[24px]" aria-hidden="true" />
        )}
      </button>

      {/* Share actions */}
      <div
        id={panelId}
        role="group"
        aria-label="共有先"
        hidden={!isOpen}
        className={isOpen ? 'flex flex-wrap items-center justify-end gap-[8px]' : 'hidden'}
      >
        {shareActions.map((action) => (
          <a
            key={action.name}
            href={action.getUrl(fullTitle, url, siteConfig.social.twitter)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'flex h-[44px] w-[44px] items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-110',
              action.color,
            )}
            aria-label={`${action.name}で共有（新しいタブで開く）`}
            title={`${action.name}で共有（新しいタブで開く）`}
          >
            <action.icon className="size-[20px]" aria-hidden="true" />
          </a>
        ))}
      </div>
    </div>
  );
}
