import type { ContentFrontmatter } from '@/lib/content/types';
import { formatDate } from '@/lib/utils';

export function ContentReview({ review }: { review: ContentFrontmatter['review'] }) {
  if (!review) {
    return <p className="mt-5 text-sm text-subtle">情報の最終確認日：未記録</p>;
  }

  return (
    <aside aria-label="情報の確認記録" className="mt-5 border-l-2 border-line-strong pl-4 text-sm leading-7">
      <dl className="space-y-1">
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-medium text-ink">情報の最終確認日</dt>
          <dd>
            <time dateTime={review.checked}>{formatDate(review.checked)}</time>
          </dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-medium text-ink">対象地域</dt>
          <dd>{review.region}</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">確認した範囲</dt>
          <dd>{review.scope}</dd>
        </div>
      </dl>
      <p className="mt-2 font-medium text-ink">確認に用いた資料</p>
      <ul className="list-disc space-y-1 pl-5">
        {review.sources.map((source, index) => (
          <li key={`${source.url}-${index}`}>
            <a href={source.url} className="text-brand underline underline-offset-4 break-words">
              {source.title}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
