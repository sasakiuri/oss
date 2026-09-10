// SPDX-License-Identifier: MIT
import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn } from '../lib/classes';

export function Card({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('border-line bg-surface rounded-xl border p-5', className)}>
      {title && <h2 className="mb-4 text-lg font-semibold">{title}</h2>}
      {children}
    </section>
  );
}
export function Badge({ children }: { children: ReactNode }) {
  return <span className="bg-muted text-ink inline-flex rounded-full px-3 py-1 text-xs font-medium">{children}</span>;
}
export function NoticeBanner({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <div role={error ? 'alert' : 'status'} className="border-line bg-muted rounded-lg border p-4">
      {children}
    </div>
  );
}
export function Skeleton({ label = '読み込み中' }: { label?: string }) {
  return (
    <div role="status" aria-busy="true" className="grid gap-3">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="bg-muted h-6 rounded motion-safe:animate-pulse" />
      <div aria-hidden="true" className="bg-muted h-16 rounded motion-safe:animate-pulse" />
    </div>
  );
}
export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="mb-8">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="text-subtle mt-3">{description}</p>}
    </header>
  );
}
export function DetailPanel({ title, items }: { title: string; items: { label: string; value: ReactNode }[] }) {
  return (
    <Card title={title}>
      <dl className="grid gap-4">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-subtle text-sm">{item.label}</dt>
            <dd className="mt-1">{item.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
export function RecordMeta({ created, updated }: { created: string; updated: string }) {
  return (
    <dl className="text-subtle flex flex-wrap gap-4 text-xs">
      <div>
        <dt>作成日</dt>
        <dd>
          <time dateTime={created}>{created}</time>
        </dd>
      </div>
      <div>
        <dt>更新日</dt>
        <dd>
          <time dateTime={updated}>{updated}</time>
        </dd>
      </div>
    </dl>
  );
}
export function BackLink({ href, children = '戻る' }: { href: string; children?: ReactNode }) {
  return (
    <Link href={href} className="text-brand inline-flex min-h-11 items-center underline underline-offset-4">
      ← {children}
    </Link>
  );
}
export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="パンくず">
      <ol className="text-subtle flex flex-wrap gap-2 text-sm">
        {items.map((item, index) => (
          <li key={item.label} className="flex gap-2">
            {index > 0 && <span aria-hidden="true">/</span>}
            {item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol aria-label="手順" className="flex flex-wrap gap-4">
      {steps.map((step, index) => (
        <li
          key={step}
          aria-current={index === current ? 'step' : undefined}
          className={index === current ? 'text-brand font-semibold' : 'text-subtle'}
        >
          {index + 1}. {step}
        </li>
      ))}
    </ol>
  );
}
