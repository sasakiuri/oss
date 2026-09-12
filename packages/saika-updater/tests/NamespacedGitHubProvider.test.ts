// SPDX-License-Identifier: MIT
import type { RequestOptions } from 'node:http';

import { NsisUpdater, type AppUpdater } from 'electron-updater';
import type { AppAdapter } from 'electron-updater/out/AppAdapter.js';
import type { ProviderRuntimeOptions } from 'electron-updater/out/providers/Provider.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NamespacedGitHubProvider, type UpdateMetadataNamespace } from '../src/NamespacedGitHubProvider';

function createProvider({
  namespace = 'director',
  platform = 'win32',
  currentVersion = '0.3.0',
  tags = ['v0.4.0'],
  latestStableTag = 'v0.4.0',
  stableError,
  metadata,
}: {
  namespace?: UpdateMetadataNamespace | 'lane';
  platform?: ProviderRuntimeOptions['platform'];
  currentVersion?: string;
  tags?: string[];
  latestStableTag?: string;
  stableError?: Error;
  metadata: Record<string, string>;
}) {
  const requests: string[] = [];
  const feed = `<feed>${tags
    .map(
      (tag) =>
        `<entry><title>Saika ${tag}</title><link href="https://github.com/sasakiuri/oss/releases/tag/${tag}"/><content>Release notes</content></entry>`,
    )
    .join('')}</feed>`;
  const updater = {
    currentVersion: new NsisUpdater(undefined, { version: currentVersion } as AppAdapter).currentVersion,
    channel: null,
    allowPrerelease: currentVersion.includes('-'),
    fullChangelog: false,
  };
  const executor = {
    request: vi.fn(async (options: RequestOptions) => {
      const path = options.path ?? '';
      requests.push(path);
      if (path.endsWith('/releases.atom')) return feed;
      if (path.endsWith('/releases/latest')) {
        if (stableError) throw stableError;
        return JSON.stringify({ tag_name: latestStableTag });
      }
      const filename = path.split('/').at(-1) ?? '';
      if (filename in metadata) return metadata[filename];
      throw new Error(`Missing update metadata: ${filename}`);
    }),
  };
  const provider = new NamespacedGitHubProvider(
    { provider: 'custom', metadataNamespace: namespace === 'lane' ? undefined : namespace },
    updater as unknown as AppUpdater,
    { platform, isUseMultipleRangeRequest: false, executor } as unknown as ProviderRuntimeOptions,
  );
  return { provider, requests, updater, executor };
}

function updateMetadata(application: string, version = '0.4.0'): string {
  return `version: ${version}\nfiles:\n  - url: saika-${application}-${version}.exe\n    sha512: verified-package-hash\n`;
}

describe('NamespacedGitHubProvider', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['director', 'win32', 'x64', 'director-latest.yml'],
    ['director', 'darwin', 'arm64', 'director-latest-mac.yml'],
    ['director', 'linux', 'x64', 'director-latest-linux.yml'],
    ['director', 'linux', 'arm64', 'director-latest-linux-arm64.yml'],
    ['vista', 'win32', 'x64', 'vista-latest.yml'],
    ['vista', 'darwin', 'arm64', 'vista-latest-mac.yml'],
    ['vista', 'linux', 'x64', 'vista-latest-linux.yml'],
    ['vista', 'linux', 'arm64', 'vista-latest-linux-arm64.yml'],
  ] as const)('uses only %s update metadata on %s %s', async (namespace, platform, arch, filename) => {
    vi.stubEnv('TEST_UPDATER_ARCH', arch);
    const { provider, requests, updater } = createProvider({
      namespace,
      platform,
      metadata: {
        [filename]: updateMetadata(namespace),
        'latest.yml': updateMetadata('lane'),
      },
    });

    const update = await provider.getLatestVersion();
    const files = provider.resolveFiles(update);

    expect(requests.filter((path) => path.endsWith('.yml'))).toEqual([
      `/sasakiuri/oss/releases/download/v0.4.0/${filename}`,
    ]);
    expect(files[0]?.url.href).toBe(
      `https://github.com/sasakiuri/oss/releases/download/v0.4.0/saika-${namespace}-0.4.0.exe`,
    );
    expect(files[0]?.info.sha512).toBe('verified-package-hash');
    expect(updater.channel).toBeNull();
  });

  it.each(['director', 'vista'] as const)('preserves beta release selection for %s', async (namespace) => {
    const { provider, requests } = createProvider({
      namespace,
      currentVersion: '0.3.0-beta.1',
      tags: ['v0.5.0-alpha.1', 'v0.4.0-beta.2', 'v0.3.0'],
      metadata: { [`${namespace}-beta.yml`]: updateMetadata(namespace, '0.4.0-beta.2') },
    });

    const update = await provider.getLatestVersion();

    expect(update.version).toBe('0.4.0-beta.2');
    expect(requests.filter((path) => path.endsWith('.yml'))).toEqual([
      `/sasakiuri/oss/releases/download/v0.4.0-beta.2/${namespace}-beta.yml`,
    ]);
  });

  it.each(['lane', 'director', 'vista'] as const)('moves %s from RC to its stable release', async (namespace) => {
    const filename = namespace === 'lane' ? 'latest.yml' : `${namespace}-latest.yml`;
    const { provider, requests, updater, executor } = createProvider({
      namespace,
      currentVersion: '0.3.0-rc.1',
      tags: ['v0.3.0'],
      latestStableTag: 'v0.3.0',
      metadata: { [filename]: updateMetadata(namespace, '0.3.0') },
    });
    provider.setRequestHeaders({ 'X-Test-Header': 'preserved' });

    const update = await provider.getLatestVersion();

    expect(update.version).toBe('0.3.0');
    expect(provider.resolveFiles(update)[0]?.url.pathname).toContain(`/v0.3.0/saika-${namespace}-`);
    expect(requests.filter((path) => path.endsWith('.yml'))).toEqual([
      `/sasakiuri/oss/releases/download/v0.3.0/${filename}`,
    ]);
    for (const [options] of executor.request.mock.calls)
      expect(options.headers).toMatchObject({ 'X-Test-Header': 'preserved' });
    expect(updater.allowPrerelease).toBe(true);
    expect(updater.channel).toBeNull();
  });

  it('ignores older stable metadata even when the application was not distributed in that release', async () => {
    const { provider, requests } = createProvider({
      currentVersion: '0.4.0-rc.1',
      tags: ['v0.4.0-rc.2', 'v0.3.0'],
      latestStableTag: 'v0.3.0',
      metadata: {
        'director-rc.yml': updateMetadata('director', '0.4.0-rc.2'),
      },
    });

    expect((await provider.getLatestVersion()).version).toBe('0.4.0-rc.2');
    expect(requests.some((path) => path.endsWith('/director-latest.yml'))).toBe(false);
    expect(requests.at(-1)).toBe('/sasakiuri/oss/releases/download/v0.4.0-rc.2/director-rc.yml');
  });

  it('checks RC updates when GitHub explicitly reports no stable release', async () => {
    const { provider } = createProvider({
      currentVersion: '0.3.0-rc.1',
      tags: ['v0.3.0-rc.2'],
      stableError: Object.assign(new Error('Not Found'), { statusCode: 404 }),
      metadata: { 'director-rc.yml': updateMetadata('director', '0.3.0-rc.2') },
    });

    expect((await provider.getLatestVersion()).version).toBe('0.3.0-rc.2');
  });

  it.each([new Error('Connection reset'), Object.assign(new Error('Service unavailable'), { statusCode: 503 })])(
    'reports a failed stable lookup instead of silently selecting an RC: %s',
    async (stableError) => {
      const { provider, requests } = createProvider({
        currentVersion: '0.3.0-rc.1',
        tags: ['v0.3.0-rc.2'],
        stableError,
        metadata: { 'director-rc.yml': updateMetadata('director', '0.3.0-rc.2') },
      });

      await expect(provider.getLatestVersion()).rejects.toThrow(stableError.message);
      expect(requests.filter((path) => path.endsWith('.yml'))).toEqual([]);
    },
  );

  it.each<Record<string, string>>([{}, { 'director-latest.yml': 'version: [' }])(
    'reports missing or invalid stable metadata instead of silently selecting an RC',
    async (stableMetadata) => {
      const { provider, requests } = createProvider({
        currentVersion: '0.3.0-rc.1',
        tags: ['v0.3.0', 'v0.3.0-rc.2'],
        latestStableTag: 'v0.3.0',
        metadata: { ...stableMetadata, 'director-rc.yml': updateMetadata('director', '0.3.0-rc.2') },
      });

      await expect(provider.getLatestVersion()).rejects.toThrow();
      expect(requests.some((path) => path.endsWith('/director-rc.yml'))).toBe(false);
    },
  );

  it('keeps alpha-to-beta progression and the platform suffix', async () => {
    const { provider, requests } = createProvider({
      namespace: 'vista',
      platform: 'darwin',
      currentVersion: '0.3.0-alpha.1',
      tags: ['v0.4.0-beta.1', 'v0.3.0-alpha.2'],
      metadata: { 'vista-beta-mac.yml': updateMetadata('vista', '0.4.0-beta.1') },
    });

    expect((await provider.getLatestVersion()).version).toBe('0.4.0-beta.1');
    expect(requests.at(-1)).toBe('/sasakiuri/oss/releases/download/v0.4.0-beta.1/vista-beta-mac.yml');
  });

  it.each(['director', 'vista'] as const)('keeps prerelease fallback within %s metadata', async (namespace) => {
    const { provider, requests } = createProvider({
      namespace,
      currentVersion: '0.3.0-beta.1',
      tags: ['v0.4.0-beta.2'],
      metadata: {
        [`${namespace}-latest.yml`]: updateMetadata(namespace, '0.4.0-beta.2'),
        'beta.yml': updateMetadata('lane', '0.4.0-beta.2'),
        'latest.yml': updateMetadata('lane'),
      },
    });

    const update = await provider.getLatestVersion();

    expect(requests.filter((path) => path.endsWith('.yml'))).toEqual([
      `/sasakiuri/oss/releases/download/v0.4.0-beta.2/${namespace}-beta.yml`,
      `/sasakiuri/oss/releases/download/v0.4.0-beta.2/${namespace}-latest.yml`,
    ]);
    expect(provider.resolveFiles(update)[0]?.url.pathname).toContain(`saika-${namespace}-`);
  });

  it('fails when application metadata is missing even if Lane metadata exists', async () => {
    const { provider, requests } = createProvider({
      namespace: 'director',
      currentVersion: '0.3.0-beta.1',
      tags: ['v0.4.0-beta.2'],
      metadata: {
        'latest.yml': updateMetadata('lane'),
        'beta.yml': updateMetadata('lane', '0.4.0-beta.2'),
        'vista-latest.yml': updateMetadata('vista'),
      },
    });

    await expect(provider.getLatestVersion()).rejects.toThrow('Missing update metadata: director-latest.yml');
    expect(requests.filter((path) => path.endsWith('.yml'))).toHaveLength(2);
  });

  it('retains the standard rejection of files without checksums', async () => {
    const { provider } = createProvider({
      metadata: { 'director-latest.yml': 'version: 0.4.0\nfiles:\n  - url: saika-director-0.4.0.exe\n' },
    });

    const update = await provider.getLatestVersion();

    expect(() => provider.resolveFiles(update)).toThrow(/checksum/);
  });
});
