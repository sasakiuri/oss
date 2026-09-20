'use client';

import * as Dialog from '@radix-ui/react-dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { Home, Menu, X, ShoppingCart, FileText, Info, BookOpen } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { siteConfig } from '@/lib/config';

const navItems = [
  { href: '/articles', label: '記事一覧', icon: BookOpen },
  { href: '/articles/1597956932', label: '申請書類', icon: FileText },
  { href: '/about', label: '案内所', icon: Info },
];

export function Header() {
  const [open, setOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-50 bg-slate-700">
      <div className="mx-auto max-w-3xl px-4">
        <nav className="flex h-14 items-center justify-between">
          {/* Mobile menu button */}
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger asChild>
              <button className="rounded-md p-2 text-white hover:bg-slate-600 md:hidden" aria-label="メニューを開く">
                <Menu className="h-6 w-6" />
              </button>
            </Dialog.Trigger>

            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out" />
              <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg data-[state=open]:animate-slide-in-from-left data-[state=closed]:animate-slide-out-to-left">
                <VisuallyHidden.Root>
                  <Dialog.Title>ナビゲーションメニュー</Dialog.Title>
                  <Dialog.Description>サイト内のページへのリンク</Dialog.Description>
                </VisuallyHidden.Root>
                <div className="flex h-14 items-center bg-slate-700 px-4">
                  <Dialog.Close asChild>
                    <button className="rounded-md p-2 text-white hover:bg-slate-600" aria-label="メニューを閉じる">
                      <X className="h-6 w-6" />
                    </button>
                  </Dialog.Close>
                </div>
                <ul className="divide-y divide-slate-200">
                  {navItems.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 text-slate-700 hover:bg-slate-50"
                      >
                        <item.icon className="h-5 w-5" />
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>

          {/* Desktop nav */}
          <div className="hidden items-center gap-1 md:flex">
            <Link href="/" className="rounded-md p-2 text-white hover:bg-slate-600" aria-label="トップページ">
              <Home className="h-5 w-5" />
            </Link>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 text-sm text-white hover:bg-slate-600"
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Mobile home link */}
          <Link href="/" className="rounded-md p-2 text-white hover:bg-slate-600 md:hidden" aria-label="トップページ">
            <Home className="h-5 w-5" />
          </Link>

          {/* Shopping link */}
          <a
            href={siteConfig.service.ecommerce}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-2 rounded-md px-3 py-2 text-sm text-white hover:bg-slate-600"
          >
            <ShoppingCart className="h-4 w-4" />
            <span className="hidden sm:inline">Shopping</span>
          </a>
        </nav>
      </div>
    </header>
  );
}
