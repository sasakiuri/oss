'use client';

import * as Dialog from '@radix-ui/react-dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { Home, Menu, X, ShoppingCart, FileText, Info, BookOpen } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import { SearchDialog } from '@/components/search-dialog';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { siteConfig } from '@/lib/config';
import { focusContent } from '@/lib/focus-content';

const navItems = [
  { href: '/articles', label: '記事一覧', icon: BookOpen },
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
    const updateHeight = () => {
      document.documentElement.style.setProperty('--site-header-height', `${header.getBoundingClientRect().height}px`);
    };
    const observer = new ResizeObserver(updateHeight);
    observer.observe(header);
    updateHeight();
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--site-header-height');
    };
  }, []);

  return (
    <header
      ref={headerRef}
      id="site-header"
      tabIndex={-1}
      className="site-header sticky top-0 z-50 bg-slate-700 print:hidden"
    >
      <div className="mx-auto max-w-3xl px-4">
        <nav aria-label="メインナビゲーション" className="flex min-h-14 flex-wrap items-center justify-between">
          {/* Mobile menu button */}
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger asChild>
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-md text-white hover:bg-slate-600 md:hidden"
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
                className="fixed inset-y-0 left-0 z-50 w-64 max-w-full overflow-y-auto overscroll-contain bg-surface shadow-lg data-[state=open]:animate-slide-in-from-left data-[state=closed]:animate-slide-out-to-left print:hidden"
              >
                <VisuallyHidden.Root>
                  <Dialog.Title>ナビゲーションメニュー</Dialog.Title>
                  <Dialog.Description>サイト内のページへのリンク</Dialog.Description>
                </VisuallyHidden.Root>
                <div className="flex h-14 items-center bg-slate-700 px-4">
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="flex h-11 w-11 items-center justify-center rounded-md text-white hover:bg-slate-600"
                      aria-label="メニューを閉じる"
                    >
                      <X className="h-6 w-6" aria-hidden="true" />
                    </button>
                  </Dialog.Close>
                </div>
                <ul className="divide-y divide-line">
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
                        className="flex min-h-11 items-center gap-3 px-4 py-3 text-body hover:bg-muted aria-[current=page]:bg-muted-strong aria-[current=page]:font-bold"
                      >
                        <item.icon className="h-5 w-5" aria-hidden="true" />
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>

          {/* Desktop nav */}
          <div className="hidden max-w-full flex-wrap items-center gap-1 md:flex">
            <Link
              href="/"
              className="flex h-11 w-11 items-center justify-center rounded-md text-white hover:bg-slate-600 aria-[current=page]:bg-slate-600"
              aria-label="トップページ"
              aria-current={pathname === '/' ? 'page' : undefined}
            >
              <Home className="h-5 w-5" aria-hidden="true" />
            </Link>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={pathname === item.href ? 'page' : undefined}
                className="flex min-h-11 items-center rounded-md px-3 py-2 text-sm text-white hover:bg-slate-600 aria-[current=page]:bg-slate-600 aria-[current=page]:font-bold"
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Mobile home link */}
          <Link
            href="/"
            className="flex h-11 w-11 items-center justify-center rounded-md text-white hover:bg-slate-600 aria-[current=page]:bg-slate-600 md:hidden"
            aria-label="トップページ"
            aria-current={pathname === '/' ? 'page' : undefined}
          >
            <Home className="h-5 w-5" aria-hidden="true" />
          </Link>

          <div className="ml-auto">
            <SearchDialog />
          </div>

          <ThemeSwitcher />

          {/* Shopping link */}
          <a
            href={siteConfig.service.ecommerce}
            aria-label="Shopping（通信販売）"
            className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm text-white hover:bg-slate-600"
          >
            <ShoppingCart className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Shopping</span>
          </a>
        </nav>
      </div>
    </header>
  );
}
