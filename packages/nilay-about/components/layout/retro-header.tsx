"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROUTES } from "@/lib/constants";

const navItems = [
  { href: ROUTES.HOME, label: "Home" },
  { href: ROUTES.NEWS, label: "News" },
  { href: ROUTES.CONTACT, label: "Contact" },
  { href: ROUTES.LABS, label: "Labs" },
] as const;

function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-[#000080] focus:text-white focus:px-2 focus:py-1"
    >
      メインコンテンツへスキップ
    </a>
  );
}

/**
 * RetroHeader - 1990年代CERN Webサイト風のヘッダー
 *
 * Design principles:
 * - Simple horizontal rule separator
 * - Plain text navigation with underlined links
 * - No fancy styling - pure HTML defaults
 */
export function RetroHeader() {
  const pathname = usePathname();

  return (
    <>
      <SkipLink />
      <header>
        <div className="max-w-3xl mx-auto px-4 py-2">
          <h1 className="text-xl font-bold mb-2">
            <Link href={ROUTES.HOME}>Nilay/About</Link>
          </h1>
          <nav aria-label="メインナビゲーション">
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {navItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== ROUTES.HOME && pathname.startsWith(item.href));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={isActive ? "font-bold" : ""}
                    >
                      [{item.label}]
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
        <hr />
      </header>
    </>
  );
}
