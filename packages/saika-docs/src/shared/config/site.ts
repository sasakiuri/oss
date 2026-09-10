// SPDX-License-Identifier: MIT
import packageInfo from '../../../package.json';

import { publicEnv } from './env';

export const site = {
  name: 'Saika Docs',
  description: 'Saika Lane と Saika Director の日本語マニュアル・技術資料',
  version: packageInfo.version,
  repository: 'https://github.com/sasakiuri/oss',
  sourceRef: process.env.DOCS_SOURCE_REF || '1.x',
  url: `${new URL(publicEnv.NEXT_PUBLIC_SITE_URL).origin}${publicEnv.NEXT_PUBLIC_BASE_PATH}`,
};

export function withBasePath(path: string): string {
  return `${publicEnv.NEXT_PUBLIC_BASE_PATH}${path}`;
}

export function absoluteUrl(path: string): string {
  return `${site.url}${path}`;
}
