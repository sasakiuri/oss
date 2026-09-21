'use client';

// cspell:words Hatena

import * as Popover from '@radix-ui/react-popover';
import { Facebook, Mail, Printer, Share2, Twitter, X } from 'lucide-react';
import * as React from 'react';

import { HatenaIcon, LineIcon } from '@/components/icons';
import { useContentPrint } from '@/components/print-content';
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
  printable?: boolean;
}

export function SnsShare({ printable = false, ...props }: SnsShareProps) {
  return printable ? <PrintableShare {...props} /> : <ShareMenu {...props} />;
}

function PrintableShare(props: Omit<SnsShareProps, 'printable'>) {
  // Keep print shortcuts and image preparation alive while the popover is closed.
  const printControl = useContentPrint();
  return <ShareMenu {...props} printControl={printControl} />;
}

function ShareMenu({
  title,
  slug,
  printControl,
}: Omit<SnsShareProps, 'printable'> & { printControl?: ReturnType<typeof useContentPrint> }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const fullTitle = title ? `${title} : ${siteConfig.title}` : siteConfig.title;
  const destination = new URL(`${siteConfig.siteUrl}/${slug ?? ''}`);
  destination.pathname = `${destination.pathname.replace(/\/+$/, '')}/`;
  const url = destination.href;

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <div className="fixed right-[16px] bottom-[calc(16px+env(safe-area-inset-bottom))] z-50 print:hidden">
        <Popover.Trigger asChild>
          <button
            ref={triggerRef}
            type="button"
            className="flex h-[48px] w-[48px] items-center justify-center rounded-full border border-line-strong bg-navigation text-white shadow-sm hover:brightness-110"
            aria-label={printControl ? '共有・印刷' : 'SNSで共有'}
            aria-describedby={printControl?.statusId}
          >
            {isOpen ? <X className="size-5" aria-hidden="true" /> : <Share2 className="size-5" aria-hidden="true" />}
          </button>
        </Popover.Trigger>
        <Popover.Content
          aria-label="共有先"
          aria-modal={false}
          side="top"
          align="end"
          sideOffset={8}
          collisionPadding={16}
          onOpenAutoFocus={(event) => {
            // Keep focus on the trigger; the next Tab reaches the first share link.
            event.preventDefault();
          }}
          onBlur={(event) => {
            // Release this layer when another dialog takes focus, before it can consume Escape.
            if (
              event.relatedTarget &&
              !event.currentTarget.contains(event.relatedTarget) &&
              event.relatedTarget !== triggerRef.current
            ) {
              setIsOpen(false);
            }
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            // An outside pointer press may remove the focused link without focusing another element.
            if (document.activeElement === document.body) triggerRef.current?.focus();
          }}
          className="z-50 w-max max-w-[calc(100vw-32px)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto rounded-lg border border-line bg-surface p-3 shadow-lg print:hidden"
        >
          <div className={cn('grid grid-cols-3 gap-2', printControl ? 'sm:grid-cols-6' : 'sm:grid-cols-5')}>
            {shareActions.map((action) => (
              <a
                key={action.name}
                href={action.getUrl(fullTitle, url, siteConfig.social.twitter)}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'flex h-[44px] w-[44px] items-center justify-center rounded-full text-white',
                  action.color,
                )}
                aria-label={`${action.name}で共有（新しいタブで開く）`}
                title={`${action.name}で共有（新しいタブで開く）`}
              >
                <action.icon className="size-[20px]" aria-hidden="true" />
              </a>
            ))}
            <a
              href={`mailto:?subject=${encodeURIComponent(fullTitle)}&body=${encodeURIComponent(`${fullTitle}\n${url}`)}`}
              aria-label="メールで送る"
              title="メールで送る"
              className="flex h-[44px] w-[44px] items-center justify-center rounded-full bg-slate-600 text-white hover:bg-slate-700"
            >
              <Mail className="size-[20px]" aria-hidden="true" />
            </a>
            {printControl && (
              <button
                type="button"
                onClick={printControl.print}
                disabled={printControl.busy}
                aria-label="ページを印刷"
                title="ページを印刷"
                aria-describedby={printControl.statusId}
                className="flex h-[44px] w-[44px] items-center justify-center rounded-full bg-slate-600 text-white hover:bg-slate-700 disabled:opacity-60"
              >
                <Printer className="size-[20px]" aria-hidden="true" />
              </button>
            )}
          </div>
          {printControl?.message && (
            <p aria-hidden="true" className="mt-3 max-w-64 border-t border-line pt-3 text-sm leading-6 text-subtle">
              {printControl.message}
            </p>
          )}
        </Popover.Content>
        {printControl && (
          <p
            id={printControl.statusId}
            role="status"
            aria-atomic="true"
            className={
              isOpen || !printControl.message
                ? 'sr-only'
                : 'absolute right-0 bottom-full mb-3 w-64 max-w-[calc(100vw-32px)] rounded-lg border border-line bg-surface p-3 text-sm leading-6 text-body shadow-md'
            }
          >
            {printControl.message}
          </p>
        )}
      </div>
    </Popover.Root>
  );
}
