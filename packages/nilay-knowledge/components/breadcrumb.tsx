import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { createBreadcrumbSchema } from '@/lib/schema';

export interface BreadcrumbItem {
  name: string;
  slug: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  showNav?: boolean;
}

export function Breadcrumb({ items, showNav = true }: BreadcrumbProps) {
  const jsonLd = createBreadcrumbSchema(items);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {showNav && (
        <nav aria-label="パンくずリスト" className="mx-auto max-w-3xl px-4">
          <ol className="flex flex-wrap items-center gap-1 py-3 text-sm text-slate-600">
            {items.map((item, index) => (
              <li key={item.slug} className="flex items-center">
                {index > 0 && (
                  <ChevronRight className="mx-1 h-4 w-4 text-slate-400" />
                )}
                {index === items.length - 1 ? (
                  <span className="text-slate-900">{item.name}</span>
                ) : (
                  <Link
                    href={`/${item.slug}`}
                    className="hover:text-slate-900 hover:underline"
                  >
                    {item.name}
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
