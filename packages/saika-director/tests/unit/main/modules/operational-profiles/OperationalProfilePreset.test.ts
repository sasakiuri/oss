import { describe, expect, it, vi } from 'vitest';

import {
  OperationalProfileService,
  directorOperationalPresets,
  type OperationalProfilePreset,
} from '@/main/modules/operational-profiles';
import { assessOperationalPresets } from '@/main/modules/operational-profiles/OperationalProfilePreset';

describe('Operational presets', () => {
  it('offers replaceable suggestions without writing settings or exposing mutable preset data', async () => {
    const write = vi.fn();
    const preset: OperationalProfilePreset = {
      id: 'local',
      label: 'Local workflow',
      description: '',
      modes: { relay: 'REQUIRED' },
    };
    const service = new OperationalProfileService(
      [{ id: 'relay', label: 'Relay', scope: 'COMPETITION', read: () => ({ mode: 'ADVISORY', context: '' }), write }],
      () => {},
      [preset],
    );
    const preview = await service.preview({ competitionId: 'competition', modes: {} });
    expect(preview.changes[0]?.after).toBe('ADVISORY');
    expect(preview.presets[0]).toMatchObject({ modes: { relay: 'REQUIRED' }, issues: [] });
    preview.presets[0]!.modes.relay = 'DISABLED';
    expect(preset.modes.relay).toBe('REQUIRED');
    expect(write).not.toHaveBeenCalled();
  });

  it('marks missing components and unsupported binary modes instead of partially applying a suggestion', () => {
    const preset = {
      id: 'local',
      label: 'Local',
      description: '',
      modes: { access: 'ADVISORY', absent: 'REQUIRED' },
    } as const;
    const [result] = assessOperationalPresets([preset], [{ id: 'access', supportedModes: ['DISABLED', 'REQUIRED'] }]);
    expect(result?.issues).toEqual(['Setting access does not support ADVISORY', 'Setting absent is not installed']);
    expect(result?.modes).toEqual(preset.modes);
    expect(() => assessOperationalPresets([preset, preset], [])).toThrow('Duplicate');
  });

  it('keeps manual equipment, integrated timing, result review and captured backups independently selectable', () => {
    const [manual, integrated, publication, backup] = directorOperationalPresets;
    expect(manual?.modes).toMatchObject({
      relay: 'REQUIRED',
      inspection: 'REQUIRED',
      'timed-target-physicalSignals': 'ADVISORY',
    });
    expect(integrated?.modes).toMatchObject({
      'timing-evidence': 'REQUIRED',
      'timed-target-physicalSignals': 'REQUIRED',
    });
    expect(manual?.modes).not.toHaveProperty('backup-capture');
    expect(integrated?.modes).not.toHaveProperty('backup-capture');
    expect(publication?.modes).not.toHaveProperty('timed-target-physicalSignals');
    expect(backup?.modes).toEqual({ 'backup-capture': 'REQUIRED' });
    for (const preset of directorOperationalPresets) expect(preset.modes).not.toHaveProperty('operator-access');
  });
});
