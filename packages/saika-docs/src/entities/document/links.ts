// SPDX-License-Identifier: MIT
import { posix } from 'node:path';

const docsRoot = '/packages/saika-docs';
export const repositoryUrl = 'https://github.com/sasakiuri/oss';

export function documentHref(sourcePath: string): string {
  const path = sourcePath
    .replace(/(^|\/)README\.md$/, '$1')
    .replace(/(^|\/)INDEX\.md$/, '$1documents.md')
    .replace(/\.md$/, '')
    .toLowerCase()
    .replaceAll('_', '-');
  return `/${path}`.replace(/\/?$/, '/');
}

export function resolveDocLink(href: string, sourcePath: string, sourceRef = '1.x'): string {
  if (/^(?:[a-z][a-z\d+.-]*:|\/|#|\?)/i.test(href)) return href;
  const match = /^([^?#]*)(.*)$/.exec(href);
  if (!match) return href;
  const pathname = match[1] ?? '';
  const suffix = match[2] ?? '';
  const resolved = posix.resolve(docsRoot, posix.dirname(sourcePath), pathname);
  if (resolved.startsWith(`${docsRoot}/`) && pathname.endsWith('.md')) {
    return `${documentHref(posix.relative(docsRoot, resolved))}${suffix}`;
  }
  if (!resolved.startsWith(`${docsRoot}/`) || resolved === `${docsRoot}/LICENSE`) {
    const kind = pathname.endsWith('/') ? 'tree' : 'blob';
    return `${repositoryUrl}/${kind}/${encodeURIComponent(sourceRef)}${resolved}${suffix}`;
  }
  return href;
}
