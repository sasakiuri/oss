"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Nilay/About" },
  { href: "/news", label: "ニュース" },
  { href: "/contact", label: "お問い合わせ" },
];

export function Header() {
  const pathname = usePathname();

  const getActiveIndex = () => {
    if (pathname === "/") return 0;
    if (pathname.startsWith("/news")) return 1;
    if (pathname === "/contact") return 2;
    return -1;
  };

  const activeIndex = getActiveIndex();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background">
      <div className="mx-auto max-w-6xl px-4">
        <nav className="flex h-14 items-center" role="navigation">
          <ul className="flex gap-1">
            {navItems.map((item, index) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "relative inline-flex h-14 items-center px-4 text-sm font-medium transition-colors hover:text-foreground",
                    activeIndex === index
                      ? "text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {item.label}
                  {activeIndex === index && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
