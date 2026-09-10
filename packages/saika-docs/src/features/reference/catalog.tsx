// SPDX-License-Identifier: MIT
'use client';
import { useQuery } from '@tanstack/react-query';
import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { catalogSchema } from '@/entities/catalog/model';
import { browserApi } from '@/shared/api/browser-client';
import { toQueryString } from '@/shared/api/query';
import { withBasePath } from '@/shared/config/site';
import { positiveIntegerParam } from '@/shared/lib/search-params';
import { Button } from '@/shared/ui/button';
import { TextField } from '@/shared/ui/form';
import { NoticeBanner, Skeleton } from '@/shared/ui/panels';
import { FilterPanel, Pagination, SortableTh, TableFrame } from '@/shared/ui/table';

export function Catalog() {
  const query = useQuery({
    queryKey: ['catalog'],
    queryFn: ({ signal }) => browserApi('/catalog/', catalogSchema, { signal }, '/api'),
  });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [ascending, setAscending] = useState(true);
  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      const value = params.get('q') ?? '';
      setSearch(value);
      setFilter(value);
      setPage(positiveIntegerParam(Object.fromEntries(params), 'page'));
      setAscending(params.get('sort') !== 'desc');
    };
    restore();
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  const items = [...(query.data ?? [])]
    .filter((item) => item.title.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => a.title.localeCompare(b.title, 'ja') * (ascending ? 1 : -1));
  const total = Math.max(1, Math.ceil(items.length / 5));
  const current = Math.min(page, total);
  function changePage(value: number) {
    setPage(positiveIntegerParam({ page: String(value) }, 'page'));
    window.history.replaceState(
      null,
      '',
      `${withBasePath('/reference/')}${toQueryString({ q: filter, page: value, sort: ascending ? undefined : 'desc' })}`,
    );
  }
  if (query.isPending) return <Skeleton />;
  if (query.isError)
    return (
      <NoticeBanner error>
        一覧を読み込めませんでした。<Button onClick={() => void query.refetch()}>再試行</Button>
      </NoticeBanner>
    );
  return (
    <div className="grid gap-4">
      <FilterPanel
        onSubmit={() => {
          setFilter(search);
          setPage(1);
          window.history.replaceState(null, '', `${withBasePath('/reference/')}${toQueryString({ q: search })}`);
        }}
      >
        <TextField label="文書名で検索" value={search} onChange={(event) => setSearch(event.target.value)} />
      </FilterPanel>
      <p role="status" className="text-subtle text-sm">
        {items.length} 件の文書
      </p>
      <Pagination
        label="一覧の上のページ切り替え"
        page={current}
        totalPages={total}
        totalItems={items.length}
        onChange={changePage}
        href={(value) =>
          `/reference/${toQueryString({ q: filter, page: value, sort: ascending ? undefined : 'desc' })}` as Route
        }
      />
      <TableFrame caption="文書一覧">
        <thead>
          <tr>
            <SortableTh
              direction={ascending ? 'ascending' : 'descending'}
              onSort={() => {
                setAscending(!ascending);
                window.history.replaceState(
                  null,
                  '',
                  `${withBasePath('/reference/')}${toQueryString({ q: filter, page: current, sort: ascending ? 'desc' : undefined })}`,
                );
              }}
            >
              文書名
            </SortableTh>
            <th scope="col" className="bg-muted p-3">
              概要
            </th>
          </tr>
        </thead>
        <tbody>
          {items.slice((current - 1) * 5, current * 5).map((item) => (
            <tr key={item.id} className="border-line border-t">
              <td className="p-3">
                <Link className="text-brand underline" href={item.href}>
                  {item.title}
                </Link>
              </td>
              <td className="p-3">{item.description}</td>
            </tr>
          ))}
        </tbody>
      </TableFrame>
      <Pagination page={current} totalPages={total} totalItems={items.length} onChange={changePage} />
      <Button variant="outline" onClick={() => void query.refetch()}>
        一覧を再取得
      </Button>
    </div>
  );
}
