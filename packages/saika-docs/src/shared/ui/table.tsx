// SPDX-License-Identifier: MIT
'use client';
import type { Route } from 'next';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';

import { Button } from './button';
import { Dialog } from './dialog';

export function TableFrame({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="border-line overflow-x-auto rounded-lg border" role="region" aria-label={caption} tabIndex={0}>
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}
export function SortableTh({
  children,
  direction,
  onSort,
}: {
  children: ReactNode;
  direction?: 'ascending' | 'descending';
  onSort: () => void;
}) {
  return (
    <th scope="col" aria-sort={direction ?? 'none'} className="bg-muted px-4">
      <button type="button" onClick={onSort} className="min-h-11 font-semibold">
        {children}
        <span aria-hidden="true"> {direction === 'ascending' ? '↑' : '↓'}</span>
      </button>
    </th>
  );
}
export function Pagination({
  page,
  totalPages,
  onChange,
  href,
  totalItems,
  pageSize = 5,
  label = 'ページ切り替え',
}: {
  page: number;
  totalPages: number;
  onChange?: (page: number) => void;
  href?: (page: number) => Route;
  totalItems?: number;
  pageSize?: number;
  label?: string;
}) {
  const total = Math.max(1, totalPages);
  const current = Math.min(Math.max(1, page), total);
  const pages = Array.from(new Set([1, ...Array.from({ length: 5 }, (_, i) => current - 2 + i), total]))
    .filter((value) => value > 0 && value <= total)
    .sort((a, b) => a - b);
  const control = (value: number, text: ReactNode, disabled: boolean, selected = false) =>
    href && !disabled ? (
      <Link
        className="border-line inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-3"
        aria-current={selected ? 'page' : undefined}
        href={href(value)}
        onClick={
          onChange
            ? (event) => {
                if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) {
                  event.preventDefault();
                  onChange(value);
                }
              }
            : undefined
        }
      >
        {text}
      </Link>
    ) : (
      <Button
        variant={selected ? 'primary' : 'outline'}
        aria-current={selected ? 'page' : undefined}
        disabled={disabled}
        onClick={() => onChange?.(value)}
      >
        {text}
      </Button>
    );
  return (
    <nav aria-label={label} className="my-4 flex flex-wrap items-center gap-2">
      {control(current - 1, '前へ', current <= 1)}
      {pages.map((value, index) => (
        <span key={value} className="inline-flex items-center gap-2">
          {index > 0 && value - pages[index - 1]! > 1 && <span aria-hidden="true">…</span>}
          {control(value, value, false, value === current)}
        </span>
      ))}
      {control(current + 1, '次へ', current >= total)}
      <span aria-live="polite" className="text-subtle text-sm">
        {current} / {total}
        {totalItems !== undefined &&
          ` ・ ${totalItems === 0 ? 0 : (current - 1) * pageSize + 1}–${Math.min(current * pageSize, totalItems)} / ${totalItems} 件`}
      </span>
    </nav>
  );
}
export function FilterPanel({
  children,
  onSubmit,
  mobileActions,
}: {
  children: ReactNode;
  onSubmit: () => void;
  mobileActions?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const form = (
    <form
      className="bg-muted grid gap-4 rounded-xl p-5 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
        setOpen(false);
      }}
    >
      {children}
      <div className="flex items-end">
        <Button type="submit">絞り込む</Button>
      </div>
    </form>
  );
  return (
    <>
      <div className="hidden sm:block">{form}</div>
      <div className="flex gap-2 sm:hidden">
        <Dialog
          open={open}
          onOpenChange={setOpen}
          side
          title="検索条件"
          description="条件を指定して一覧を絞り込みます"
          trigger={<Button variant="outline">検索条件</Button>}
        >
          {form}
        </Dialog>
        {mobileActions}
      </div>
    </>
  );
}
