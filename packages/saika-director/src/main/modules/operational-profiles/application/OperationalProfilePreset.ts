import type { OperationalMode, OperationalSettingTarget } from './OperationalProfileService';

export interface OperationalProfilePreset {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly modes: Readonly<Record<string, OperationalMode>>;
}

/** Describes proposals against installed setting ports without reading or changing operational state. */
export function assessOperationalPresets(
  presets: readonly OperationalProfilePreset[],
  targets: readonly Pick<OperationalSettingTarget, 'id' | 'supportedModes'>[],
) {
  if (new Set(presets.map((preset) => preset.id)).size !== presets.length)
    throw new Error('Duplicate operational preset identifier');
  return presets.map((preset) => {
    const issues: string[] = [];
    if (!preset.id.trim() || !preset.label.trim() || Object.keys(preset.modes).length === 0)
      throw new Error('Operational presets require an identifier, label and at least one setting');
    for (const [id, mode] of Object.entries(preset.modes)) {
      const target = targets.find((item) => item.id === id);
      if (!target) issues.push(`Setting ${id} is not installed`);
      else if (!(target.supportedModes ?? ['DISABLED', 'ADVISORY', 'REQUIRED']).includes(mode))
        issues.push(`Setting ${id} does not support ${mode}`);
    }
    return { ...preset, modes: { ...preset.modes }, issues };
  });
}
