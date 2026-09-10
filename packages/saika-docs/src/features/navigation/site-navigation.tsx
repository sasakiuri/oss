// SPDX-License-Identifier: MIT
'use client';

import { Github, Menu, Moon, Sun } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useState } from 'react';

import type { NavigationGroup } from '@/entities/document/model';
import { SearchDialog } from '@/features/search/search-dialog';
import { site, withBasePath } from '@/shared/config/site';
import { cn } from '@/shared/lib/classes';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { IconButton } from '@/shared/ui/icon-button';

export function Sidebar({ groups, onNavigate }: { groups: NavigationGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="文書メニュー" className="space-y-8">
      {groups.map((group) => (
        <section key={group.title}>
          <h2 className="text-ink mb-2 px-3 text-[13px] font-medium">{group.title}</h2>
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.href}>
                <Link
                  prefetch={false}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={pathname === item.href ? 'page' : undefined}
                  className={cn(
                    'text-subtle hover:bg-muted hover:text-ink block rounded-md px-3 py-2 text-[13px] leading-relaxed transition-colors',
                    pathname === item.href && 'bg-muted text-ink font-medium',
                  )}
                >
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}

export function SiteHeader({ groups }: { groups: NavigationGroup[] }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const pathname = usePathname();
  const sections = [
    { href: '/getting-started/', title: '導入と接続' },
    { href: '/lane/', title: 'Lane' },
    { href: '/director/', title: 'Director' },
    { href: '/documents/', title: '文書一覧' },
  ];
  return (
    <header className="border-line bg-surface sticky top-0 z-30 border-b">
      <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-5">
        <Link prefetch={false} href="/" className="flex shrink-0 items-center gap-2.5">
          <Image src={withBasePath('/icon.svg')} alt="" width={30} height={30} unoptimized className="shrink-0" />
          <span className="text-xl font-semibold tracking-tight">Saika Docs</span>
          <span className="border-line text-subtle ml-1 hidden rounded border px-1.5 py-0.5 text-[11px] sm:inline">
            v{site.version}
          </span>
        </Link>
        <nav aria-label="主なガイド" className="hidden items-center gap-1 xl:flex">
          {sections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              prefetch={false}
              aria-current={pathname === section.href ? 'page' : undefined}
              className={cn(
                'text-subtle hover:bg-muted hover:text-ink rounded-full px-3 py-2 text-[13px] transition-colors',
                pathname.startsWith(section.href) && 'bg-muted text-ink',
              )}
            >
              {section.title}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1 sm:gap-2">
          <SearchDialog />
          <IconButton label="テーマを切り替え" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
            <Sun size={19} aria-hidden="true" className="hidden dark:block" />
            <Moon size={19} aria-hidden="true" className="dark:hidden" />
          </IconButton>
          <IconButton label="GitHub リポジトリ" asChild className="hidden sm:inline-flex">
            <a href={site.repository} target="_blank" rel="noreferrer">
              <Github size={19} aria-hidden="true" />
            </a>
          </IconButton>
          <div className="lg:hidden">
            <Dialog
              open={menuOpen}
              onOpenChange={setMenuOpen}
              title="文書メニュー"
              description="閲覧するマニュアルを選びます。"
              side
              trigger={
                <Button variant="ghost" size="icon" aria-label="文書メニューを開く">
                  <Menu size={21} aria-hidden="true" />
                </Button>
              }
            >
              <Sidebar groups={groups} onNavigate={() => setMenuOpen(false)} />
            </Dialog>
          </div>
        </div>
      </div>
    </header>
  );
}
