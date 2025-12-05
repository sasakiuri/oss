"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";

const navItems = [
  { href: ROUTES.HOME, label: "Nilay/About" },
  { href: ROUTES.NEWS, label: "ニュース" },
  { href: ROUTES.CONTACT, label: "お問い合わせ" },
] as const;

function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md"
    >
      メインコンテンツへスキップ
    </a>
  );
}

export function Header() {
  const pathname = usePathname();

  const getActiveIndex = () => {
    if (pathname === ROUTES.HOME) return 0;
    if (pathname.startsWith(ROUTES.NEWS)) return 1;
    if (pathname === ROUTES.CONTACT) return 2;
    return -1;
  };

  const activeIndex = getActiveIndex();

  return (
    <>
      <SkipLink />
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background">
        <div className="mx-auto max-w-6xl px-4">
          <nav className="flex h-14 items-center" aria-label="メインナビゲーション">
            <ul className="flex gap-1" role="list">
              {navItems.map((item, index) => {
                const isActive = activeIndex === index;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "relative inline-flex h-14 items-center px-4 text-sm font-medium transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
                        isActive ? "text-foreground" : "text-muted-foreground"
                      )}
                      aria-current={isActive ? "page" : undefined}
                    >
                      {item.label}
                      {isActive && (
                        <span
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                          aria-hidden="true"
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </header>
    </>
  );
}
