// SPDX-License-Identifier: MIT
'use client';
import * as Primitive from '@radix-ui/react-avatar';

export function Avatar({ name, src }: { name: string; src?: string }) {
  return (
    <Primitive.Root
      className="bg-muted inline-flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full"
      role="img"
      aria-label={name}
    >
      {src && <Primitive.Image className="size-full object-cover" src={src} alt={name} />}
      <Primitive.Fallback aria-hidden="true">{name.slice(0, 2)}</Primitive.Fallback>
    </Primitive.Root>
  );
}
