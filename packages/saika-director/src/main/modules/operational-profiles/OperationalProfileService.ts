import { createHash } from 'node:crypto';

export type OperationalMode = 'DISABLED' | 'ADVISORY' | 'REQUIRED';
const allModes: readonly OperationalMode[] = ['DISABLED', 'ADVISORY', 'REQUIRED'];
export interface OperationalSettingTarget {
  readonly id: string;
  readonly label: string;
  readonly scope: 'COMPETITION' | 'DIRECTOR';
  readonly supportedModes?: readonly OperationalMode[];
  read(
    competitionId: string,
  ): { mode: OperationalMode; context: string } | Promise<{ mode: OperationalMode; context: string }>;
  write(competitionId: string, mode: OperationalMode): void | Promise<void>;
}
export interface OperationalProfileSelection {
  readonly competitionId: string;
  readonly modes: Readonly<Record<string, OperationalMode>>;
}

/** Orchestrates replaceable settings ports without owning their storage or enforcement rules. */
export class OperationalProfileService {
  constructor(
    private readonly targets: readonly OperationalSettingTarget[],
    private readonly assertEditable: (competitionId: string) => void,
  ) {
    if (new Set(targets.map((target) => target.id)).size !== targets.length)
      throw new Error('Duplicate operational setting target');
    for (const target of targets) {
      const supported = target.supportedModes ?? allModes;
      if (
        supported.length === 0 ||
        new Set(supported).size !== supported.length ||
        supported.some((mode) => !allModes.includes(mode))
      )
        throw new Error(`Invalid supported modes for ${target.id}`);
    }
  }

  async preview(input: OperationalProfileSelection) {
    this.assertEditable(input.competitionId);
    for (const [key, mode] of Object.entries(input.modes)) {
      const target = this.targets.find((target) => target.id === key);
      if (!target) throw new Error(`Unknown operational setting: ${key}`);
      if (!(target.supportedModes ?? allModes).includes(mode))
        throw new Error(`Unsupported operational mode for ${key}: ${mode}`);
    }
    const changes = await Promise.all(
      this.targets.map(async (target) => {
        const current = await target.read(input.competitionId);
        const supportedModes = [...(target.supportedModes ?? allModes)];
        if (!supportedModes.includes(current.mode)) throw new Error(`Unsupported current mode for ${target.id}`);
        return {
          id: target.id,
          label: target.label,
          scope: target.scope,
          supportedModes,
          before: current.mode,
          after: input.modes[target.id] ?? current.mode,
          context: current.context,
        };
      }),
    );
    return {
      competitionId: input.competitionId,
      changes,
      fingerprint: createHash('sha256')
        .update(JSON.stringify({ competitionId: input.competitionId, changes }))
        .digest('hex'),
    };
  }

  async apply(input: OperationalProfileSelection & { fingerprint: string }) {
    const preview = await this.preview(input);
    if (preview.fingerprint !== input.fingerprint)
      throw new Error('Settings changed after preview; review the current settings again');
    const results: { id: string; status: 'APPLIED' | 'UNCHANGED' | 'FAILED'; message: string }[] = [];
    for (const change of preview.changes) {
      if (change.before === change.after) {
        results.push({ id: change.id, status: 'UNCHANGED', message: 'Already configured' });
        continue;
      }
      try {
        this.assertEditable(input.competitionId);
        const target = this.targets.find((item) => item.id === change.id)!;
        const current = await target.read(input.competitionId);
        if (current.mode !== change.before || current.context !== change.context)
          throw new Error('Setting changed during application; preview again');
        await target.write(input.competitionId, change.after);
        if ((await target.read(input.competitionId)).mode !== change.after)
          throw new Error('The setting was not confirmed');
        results.push({ id: change.id, status: 'APPLIED', message: 'Saved and confirmed' });
      } catch (error) {
        results.push({
          id: change.id,
          status: 'FAILED',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { complete: results.every((result) => result.status !== 'FAILED'), results };
  }
}
