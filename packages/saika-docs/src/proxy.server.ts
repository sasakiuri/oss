// SPDX-License-Identifier: MIT
import { NextResponse, type NextRequest } from 'next/server';

import { readServerEnv } from './shared/config/env';

// Web Crypto verification supports both Node and Edge runtimes without timing-sensitive string comparison.
async function equal(actual: string, expected: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(expected), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(expected));
  return crypto.subtle.verify('HMAC', key, signature, encoder.encode(actual));
}
export default async function proxy(request: NextRequest) {
  const env = readServerEnv();
  if (!env.DOCS_PREVIEW_AUTH) return NextResponse.next();
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Basic ')) {
    try {
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(
        Uint8Array.from(atob(auth.slice(6)), (character) => character.charCodeAt(0)),
      );
      if (await equal(decoded, `${env.PREVIEW_AUTH_USER}:${env.PREVIEW_AUTH_PASSWORD}`)) {
        const response = NextResponse.next();
        response.headers.set('Cache-Control', 'private, no-store');
        return response;
      }
    } catch {
      /* Malformed credentials are unauthorized. */
    }
  }
  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Saika preview", charset="UTF-8"',
      'Cache-Control': 'private, no-store',
    },
  });
}
