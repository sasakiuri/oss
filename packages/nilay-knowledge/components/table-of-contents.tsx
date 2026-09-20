import type { TocItem } from '@/lib/content/types';

export function TableOfContents({ items }: { items: TocItem[] }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="目次" className="sticky top-20 hidden w-64 shrink-0 self-start md:block">
      <h2 className="mb-3 text-sm font-bold text-slate-700">目次</h2>
      <ul className="space-y-1 text-sm">
        {items.map((item) => (
          <li key={item.id} style={{ paddingLeft: `${item.level - 2}rem` }}>
            <a href={`#${item.id}`} className="block px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800">
              {item.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
