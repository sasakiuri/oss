// SPDX-License-Identifier: MIT
import type { AppUpdater } from 'electron-updater';
import { GitHubProvider } from 'electron-updater/out/providers/GitHubProvider.js';
import type { ProviderRuntimeOptions } from 'electron-updater/out/providers/Provider.js';

export type UpdateMetadataNamespace = 'director' | 'vista';

interface NamespacedGitHubOptions {
  provider: 'custom';
  metadataNamespace?: unknown;
}

export class NamespacedGitHubProvider extends GitHubProvider {
  private readonly metadataNamespace: UpdateMetadataNamespace | undefined;
  private readonly stableProvider?: NamespacedGitHubProvider;
  private stableReleaseNotApplicable = false;

  constructor(
    options: NamespacedGitHubOptions,
    private readonly releaseUpdater: AppUpdater,
    runtimeOptions: ProviderRuntimeOptions,
  ) {
    super({ provider: 'github', owner: 'sasakiuri', repo: 'oss' }, releaseUpdater, runtimeOptions);
    if (
      options.metadataNamespace !== undefined &&
      options.metadataNamespace !== 'director' &&
      options.metadataNamespace !== 'vista'
    ) {
      throw new Error('A supported application update metadata namespace is required.');
    }
    this.metadataNamespace = options.metadataNamespace;
    if (releaseUpdater.allowPrerelease && releaseUpdater.currentVersion.prerelease[0] === 'rc') {
      // The upstream provider keeps custom channels on that channel. A release
      // candidate should move to a newer stable release when one is available.
      const stableUpdater = Object.create(releaseUpdater, {
        allowPrerelease: { value: false },
        channel: { value: null },
      }) as AppUpdater;
      this.stableProvider = new NamespacedGitHubProvider(options, stableUpdater, runtimeOptions);
    }
  }

  override setRequestHeaders(headers: Parameters<GitHubProvider['setRequestHeaders']>[0]): void {
    super.setRequestHeaders(headers);
    this.stableProvider?.setRequestHeaders(headers);
  }

  override async getLatestVersion(): ReturnType<GitHubProvider['getLatestVersion']> {
    this.stableReleaseNotApplicable = false;
    if (this.stableProvider) {
      try {
        const stable = await this.stableProvider.getLatestVersion();
        if (this.releaseUpdater.currentVersion.compare(stable.version) < 0) return stable;
      } catch (error) {
        if (!this.stableProvider.stableReleaseNotApplicable) throw error;
      }
    }
    return super.getLatestVersion();
  }

  protected override async httpRequest(
    ...args: Parameters<GitHubProvider['httpRequest']>
  ): ReturnType<GitHubProvider['httpRequest']> {
    const checksStableRelease =
      args[0].pathname === '/sasakiuri/oss/releases/latest' &&
      this.releaseUpdater.currentVersion.prerelease[0] === 'rc';
    try {
      const response = await super.httpRequest(...args);
      if (checksStableRelease && response) {
        const release = JSON.parse(response) as { tag_name: string };
        // Older releases may predate an application and have no metadata for it.
        // Let the upstream provider stop before requesting that metadata.
        if (this.releaseUpdater.currentVersion.compare(release.tag_name) >= 0) {
          this.stableReleaseNotApplicable = true;
          return null;
        }
      }
      return response;
    } catch (error) {
      // Preserve an explicit absence before the upstream provider wraps HTTP
      // errors. Network failures and missing/invalid metadata remain errors.
      if (checksStableRelease && error instanceof Error && 'statusCode' in error && error.statusCode === 404) {
        this.stableReleaseNotApplicable = true;
      }
      throw error;
    }
  }

  protected override getCustomChannelName(channel: string): string {
    // Prefix metadata filenames without changing the prerelease channel used to select release tags.
    return super.getCustomChannelName(this.metadataNamespace ? `${this.metadataNamespace}-${channel}` : channel);
  }
}
