import type { OperationalSettingTarget } from './OperationalProfileService';

/** Adapts a binary policy without inventing an advisory mode that the policy cannot enforce. */
export function booleanOperationalSetting(input: {
  id: string;
  label: string;
  read(): boolean;
  write(required: boolean): void;
}): OperationalSettingTarget {
  return {
    id: input.id,
    label: input.label,
    scope: 'DIRECTOR',
    supportedModes: ['DISABLED', 'REQUIRED'],
    read: () => {
      const required = input.read();
      return { mode: required ? 'REQUIRED' : 'DISABLED', context: String(required) };
    },
    write: (_competitionId, mode) => {
      if (mode === 'ADVISORY') throw new Error(`${input.label} does not support advisory mode`);
      input.write(mode === 'REQUIRED');
    },
  };
}
