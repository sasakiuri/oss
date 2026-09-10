// SPDX-License-Identifier: MIT
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { getCatalog } from '@/entities/catalog/server/repository';
import { DotChart } from '@/features/reading/dot-chart';
import { Catalog } from '@/features/reference/catalog';
import { ComponentExamples } from '@/features/reference/components';
import { pageMetadata } from '@/shared/config/metadata';
import { createQueryClient } from '@/shared/config/query';
import { absoluteUrl } from '@/shared/config/site';
import { DisabledAction } from '@/shared/ui/button';
import { BackLink, Breadcrumb, PageHeader } from '@/shared/ui/panels';
import { ShareCode } from '@/shared/ui/share-code';

export const metadata = pageMetadata('コンポーネントとデータ取得', 'フォーム・一覧・対話部品の動作例', '/reference/');
export default async function ReferencePage() {
  const client = createQueryClient();
  await client.prefetchQuery({ queryKey: ['catalog'], queryFn: getCatalog });
  const state = dehydrate(client);
  // This is a build-time document snapshot. Mark it stale so the browser refreshes it,
  // and keep wall-clock timestamps out of otherwise reproducible static output.
  for (const query of state.queries) {
    query.dehydratedAt = 0;
    query.state.dataUpdatedAt = 0;
  }
  return (
    <main id="main-content" className="min-w-0">
      <Breadcrumb items={[{ label: 'Saika Docs', href: '/' }, { label: 'コンポーネント' }]} />
      <PageHeader title="コンポーネントとデータ取得" description="再利用できる部品の動作例です。" />
      <h2 className="mb-4 text-xl font-semibold">文書一覧</h2>
      <HydrationBoundary state={state}>
        <Catalog />
      </HydrationBoundary>
      <div className="mt-10">
        <ComponentExamples />
      </div>
      <BackLink href="/">文書に戻る</BackLink>
      <DisabledAction reason="この操作は準備中です">無効な操作</DisabledAction>
      <DotChart source={'digraph reference { rankdir=LR; Markdown -> NextJS -> Browser; }'} />
      <ShareCode url={absoluteUrl('/reference/')} title="コンポーネント参照" />
    </main>
  );
}
