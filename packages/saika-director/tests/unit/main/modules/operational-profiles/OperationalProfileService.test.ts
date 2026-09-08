import { describe, expect, it, vi } from 'vitest';

import {
  OperationalProfileService,
  type OperationalMode,
  type OperationalSettingTarget,
} from '@/main/modules/operational-profiles';

function harness() {
  const state: Record<string, OperationalMode> = { relay: 'ADVISORY', inspection: 'ADVISORY' };
  let context = 'relay-1';
  const targets: OperationalSettingTarget[] = Object.keys(state).map((id) => ({
    id,
    label: id,
    scope: 'COMPETITION',
    read: () => ({ mode: state[id]!, context }),
    write: vi.fn((_competitionId, mode) => {
      state[id] = mode;
    }),
  }));
  const editable = vi.fn();
  return {
    service: new OperationalProfileService(targets, editable),
    targets,
    state,
    editable,
    moveRelay: () => {
      context = 'relay-2';
    },
  };
}

describe('OperationalProfileService', () => {
  it('requires a current preview and preserves each selected setting independently', async () => {
    const { service, state, targets } = harness();
    const selection = { competitionId: 'competition-1', modes: { relay: 'REQUIRED' as const } };
    const preview = await service.preview(selection);
    expect(state.relay).toBe('ADVISORY');
    const applied = await service.apply({ ...selection, fingerprint: preview.fingerprint });
    expect(applied.complete).toBe(true);
    expect(state).toEqual({ relay: 'REQUIRED', inspection: 'ADVISORY' });
    expect(targets[1]!.write).not.toHaveBeenCalled();
    await expect(service.apply({ ...selection, fingerprint: preview.fingerprint })).rejects.toThrow(
      'changed after preview',
    );
  });
  it('rejects a stale relay context before any writes and refuses unknown component IDs', async () => {
    const { service, targets, moveRelay } = harness();
    const selection = { competitionId: 'competition-1', modes: { relay: 'REQUIRED' as const } };
    const preview = await service.preview(selection);
    moveRelay();
    await expect(service.apply({ ...selection, fingerprint: preview.fingerprint })).rejects.toThrow('changed');
    expect(targets[0]!.write).not.toHaveBeenCalled();
    await expect(service.preview({ ...selection, modes: { unknown: 'DISABLED' } })).rejects.toThrow('Unknown');
  });
  it('reports partial failure and allows a fresh preview to retry only the remaining component', async () => {
    const { service, targets, state } = harness();
    const selection = {
      competitionId: 'competition-1',
      modes: { relay: 'REQUIRED' as const, inspection: 'REQUIRED' as const },
    };
    vi.mocked(targets[1]!.write).mockImplementationOnce(() => {
      throw new Error('Inspection unavailable');
    });
    const first = await service.apply({ ...selection, fingerprint: (await service.preview(selection)).fingerprint });
    expect(first).toMatchObject({
      complete: false,
      results: [{ status: 'APPLIED' }, { status: 'FAILED', message: 'Inspection unavailable' }],
    });
    expect(state).toEqual({ relay: 'REQUIRED', inspection: 'ADVISORY' });
    const second = await service.apply({ ...selection, fingerprint: (await service.preview(selection)).fingerprint });
    expect(second).toMatchObject({ complete: true, results: [{ status: 'UNCHANGED' }, { status: 'APPLIED' }] });
    expect(targets[0]!.write).toHaveBeenCalledTimes(1);
  });
});
