// SPDX-License-Identifier: MIT
'use client';
import * as Primitive from '@radix-ui/react-navigation-menu';
import Link from 'next/link';

export function NavigationMenu({ label, links }: { label: string; links: { href: string; label: string }[] }) {
  return (
    <Primitive.Root aria-label={label}>
      <Primitive.List className="flex flex-wrap gap-2">
        {links.map((link) => (
          <Primitive.Item key={link.href}>
            <Primitive.Link asChild>
              <Link href={link.href} className="hover:bg-muted inline-flex min-h-11 items-center rounded-lg px-4">
                {link.label}
              </Link>
            </Primitive.Link>
          </Primitive.Item>
        ))}
      </Primitive.List>
    </Primitive.Root>
  );
}
