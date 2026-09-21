'use client';

import * as Dialog from '@radix-ui/react-dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { Home, Menu, X, ShoppingCart, FileText, Info, BookOpen, Newspaper } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import { SearchDialog } from '@/components/search-dialog';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { siteConfig } from '@/lib/config';
import { focusContent } from '@/lib/focus-content';
import { observeElementHeight } from '@/lib/observe-element-height';

const navItems = [
  { href: '/articles', label: '記事一覧', icon: BookOpen },
  { href: '/news', label: 'ニュース', icon: Newspaper },
  { href: '/articles/1597956932', label: '申請書類', icon: FileText },
  { href: '/about', label: '案内所', icon: Info },
];

export function Header() {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname().replace(/\/$/, '') || '/';
  const headerRef = React.useRef<HTMLElement>(null);
  const destinationRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    return observeElementHeight(header, '--site-header-height');
  }, []);

  return (
    <header
      ref={headerRef}
      id="site-header"
      tabIndex={-1}
      className="site-header sticky top-0 z-50 border-b border-line bg-navigation print:hidden"
    >
      <div className="site-container">
        <nav aria-label="メインナビゲーション" className="flex min-h-18 flex-wrap items-center py-2 sm:gap-x-3">
          <Link
            href="/"
            aria-label="トップページ"
            aria-current={pathname === '/' ? 'page' : undefined}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-sm text-white hover:bg-white/10 aria-[current=page]:bg-white/10"
          >
            <Home className="size-5" aria-hidden="true" />
          </Link>
          {/* Desktop nav */}
          <div className="hidden max-w-full flex-wrap items-center gap-1 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={pathname === item.href ? 'page' : undefined}
                data-active={
                  pathname === item.href ||
                  (item.href === '/articles' &&
                    pathname.startsWith('/articles/') &&
                    pathname !== '/articles/1597956932') ||
                  (item.href === '/news' && pathname.startsWith('/news/')) ||
                  undefined
                }
                className="flex min-h-11 items-center px-2 py-2 text-sm text-white hover:bg-white/10 data-[active=true]:font-medium"
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="ml-auto">
            <SearchDialog />
          </div>

          <ThemeSwitcher />

          {/* Mobile menu button */}
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger asChild>
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-sm text-white hover:bg-white/10 md:hidden"
                aria-label="メニューを開く"
              >
                <Menu className="h-6 w-6" aria-hidden="true" />
              </button>
            </Dialog.Trigger>

            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out print:hidden" />
              <Dialog.Content
                onCloseAutoFocus={(event) => {
                  const destination = destinationRef.current;
                  destinationRef.current = null;
                  if (!destination) return;
                  event.preventDefault();
                  if (window.location.pathname.replace(/\/$/, '') === destination) {
                    focusContent();
                  }
                }}
                className="fixed inset-y-0 left-0 z-50 w-80 max-w-[calc(100%-2rem)] overflow-y-auto overscroll-contain bg-surface shadow-lg data-[state=open]:animate-slide-in-from-left data-[state=closed]:animate-slide-out-to-left print:hidden"
              >
                <VisuallyHidden.Root>
                  <Dialog.Title>ナビゲーションメニュー</Dialog.Title>
                  <Dialog.Description>サイト内のページへのリンク</Dialog.Description>
                </VisuallyHidden.Root>
                <div className="flex min-h-18 items-center justify-between gap-2 border-b border-line px-4">
                  <span className="text-sm font-semibold text-ink">メニュー</span>
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-body hover:bg-muted"
                      aria-label="メニューを閉じる"
                    >
                      <X className="h-6 w-6" aria-hidden="true" />
                    </button>
                  </Dialog.Close>
                </div>
                <p className="px-5 pt-6 pb-3 text-xs text-subtle">銃砲・射撃・狩猟の情報サイト</p>
                <ul className="px-2">
                  {navItems.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={pathname === item.href ? 'page' : undefined}
                        onClick={(event) => {
                          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
                            return;
                          destinationRef.current = item.href;
                          setOpen(false);
                        }}
                        className="flex min-h-14 items-center gap-3 border-l-2 border-transparent px-3 py-3 text-body hover:bg-muted aria-[current=page]:border-accent aria-[current=page]:bg-selected aria-[current=page]:font-medium"
                      >
                        <item.icon className="h-5 w-5" aria-hidden="true" />
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
                <a
                  href={siteConfig.service.ecommerce}
                  className="mx-5 mt-6 flex min-h-11 items-center gap-3 border-t border-line pt-4 text-sm text-subtle hover:text-brand"
                >
                  <ShoppingCart className="size-4" aria-hidden="true" />
                  通信販売
                </a>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>

          {/* Shopping link */}
          <a
            href={siteConfig.service.ecommerce}
            aria-label="Shopping（通信販売）"
            className="hidden min-h-11 min-w-11 items-center justify-center gap-2 border-l border-white/20 px-3 text-sm text-white hover:bg-white/10 lg:flex"
          >
            <ShoppingCart className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Shopping</span>
          </a>
        </nav>
      </div>
    </header>
  );
}
