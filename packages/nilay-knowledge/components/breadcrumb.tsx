import { ChevronRight, Home } from 'lucide-react';
import Link from 'next/link';

import { createBreadcrumbSchema } from '@/lib/schema';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  name: string;
  slug: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  showNav?: boolean;
  className?: string;
}

export function Breadcrumb({ items, showNav = true, className }: BreadcrumbProps) {
  if (items.length === 0) return null;

  const jsonLd = createBreadcrumbSchema(items);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {showNav && (
        <nav aria-label="パンくずリスト" className={cn('site-container', className)}>
          <ol className="flex min-w-0 flex-wrap items-center gap-1 py-2 text-xs text-subtle">
            {items.map((item, index) => (
              <li
                key={item.slug}
                className={cn('flex items-center gap-1', index === items.length - 1 ? 'min-w-0 flex-1' : 'shrink-0')}
              >
                {index > 0 && <ChevronRight className="h-4 w-4 shrink-0 text-faint" aria-hidden="true" />}
                {index === items.length - 1 ? (
                  <span aria-current="page" className="min-w-0 px-2 py-3 text-subtle [overflow-wrap:anywhere]">
                    {item.name}
                  </span>
                ) : (
                  <Link
                    href={`/${item.slug}`}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md px-2 hover:bg-muted-strong hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    {item.slug === '' ? (
                      <>
                        <Home className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="sr-only sm:not-sr-only">{item.name}</span>
                      </>
                    ) : (
                      item.name
                    )}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
    </>
  );
}
