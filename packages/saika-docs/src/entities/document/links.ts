// SPDX-License-Identifier: MIT
import { posix } from 'node:path';

export const docsRoot = '/packages/saika-docs';
export const repositoryUrl = 'https://github.com/sasakiuri/oss';

/** The GitHub URL of a repository path such as `/packages/saika-docs/README.md` at a branch, tag or commit. */
export function repositoryFileUrl(path: string, sourceRef: string, kind: 'blob' | 'tree' = 'blob'): string {
  return `${repositoryUrl}/${kind}/${encodeURIComponent(sourceRef)}${path}`;
}

export function documentHref(sourcePath: string): string {
  const path = sourcePath
    .replace(/(^|\/)README\.md$/, '$1')
    .replace(/(^|\/)INDEX\.md$/, '$1documents.md')
    .replace(/\.md$/, '')
    .toLowerCase()
    .replaceAll('_', '-');
  return `/${path}`.replace(/\/?$/, '/');
}

/** The site URL a resolved document link points to, or undefined when the link leaves the site. */
export function siteLinkUrl(link: string, fromHref: string): URL | undefined {
  return link.startsWith('/') || link.startsWith('#') ? new URL(link, `https://docs.invalid${fromHref}`) : undefined;
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
    return `${repositoryFileUrl(resolved, sourceRef, pathname.endsWith('/') ? 'tree' : 'blob')}${suffix}`;
  }
  return href;
}
