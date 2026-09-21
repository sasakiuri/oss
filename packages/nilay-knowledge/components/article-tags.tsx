import Link from 'next/link';

import { articleDirectoryHref } from '@/lib/content/taxonomy';

export function ArticleTags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <ul aria-label="記事のタグ" className="flex flex-wrap gap-x-3 gap-y-1">
      {tags.map((tag) => (
        <li key={tag} className="min-w-0">
          <Link
            href={articleDirectoryHref({ tags: [tag] })}
            className="inline-flex min-h-11 items-center text-xs text-brand underline-offset-4 [overflow-wrap:anywhere] hover:underline"
          >
            #{tag}
          </Link>
        </li>
      ))}
    </ul>
  );
}
