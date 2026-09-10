// SPDX-License-Identifier: MIT
'use client';
import { QRCodeSVG } from 'qrcode.react';

export function ShareCode({ url, title }: { url: string; title: string }) {
  return (
    <figure className="grid justify-items-start gap-2">
      <QRCodeSVG value={url} size={160} marginSize={4} title={`${title}の共有用 QR コード`} />
      <figcaption>
        <a className="text-brand underline" href={url}>
          {title}
        </a>
      </figcaption>
    </figure>
  );
}
