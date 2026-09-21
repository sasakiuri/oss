import type { Discipline } from './model';

export const disciplines: ReadonlyMap<string, Discipline> = new Map([
  [
    'AR10',
    {
      name: '10m Air Rifle',
      key: 'AR10',
      distance: { number: 10, unit: 'm' as const },
      heightOfTarget: { number: 140, unit: 'cm' as const },
      blackAreaSize: { number: 3.05, unit: 'cm' as const },
    },
  ],
  [
    'FR50',
    {
      name: '50m Rifle',
      key: 'FR50',
      distance: { number: 50, unit: 'm' as const },
      heightOfTarget: { number: 75, unit: 'cm' as const },
      blackAreaSize: { number: 11.24, unit: 'cm' as const },
    },
  ],
  [
    'FR300',
    {
      name: '300m Rifle',
      key: 'FR300',
      distance: { number: 300, unit: 'm' as const },
      heightOfTarget: { number: 300, unit: 'cm' as const },
      blackAreaSize: { number: 60, unit: 'cm' as const },
    },
  ],
  [
    'AP10',
    {
      name: '10m Air Pistol',
      key: 'AP10',
      distance: { number: 10, unit: 'm' as const },
      heightOfTarget: { number: 140, unit: 'cm' as const },
      blackAreaSize: { number: 5.95, unit: 'cm' as const },
    },
  ],
  [
    'RFP',
    {
      name: '25m Rapid Fire Pistol',
      key: 'RFP',
      distance: { number: 25, unit: 'm' as const },
      heightOfTarget: { number: 140, unit: 'cm' as const },
      blackAreaSize: { number: 50, unit: 'cm' as const },
    },
  ],
  [
    'STP',
    {
      name: '25m Precision Pistol',
      key: 'STP',
      distance: { number: 25, unit: 'm' as const },
      heightOfTarget: { number: 140, unit: 'cm' as const },
      blackAreaSize: { number: 20, unit: 'cm' as const },
    },
  ],
  [
    'FP',
    {
      name: '50m Pistol',
      key: 'FP',
      distance: { number: 50, unit: 'm' as const },
      heightOfTarget: { number: 75, unit: 'cm' as const },
      blackAreaSize: { number: 20, unit: 'cm' as const },
    },
  ],
]);

export function createCustomDiscipline(): Discipline {
  return {
    name: 'Custom',
    key: 'CUSTOM',
    distance: { number: 50, unit: 'm' },
    heightOfTarget: { number: 75, unit: 'cm' },
    blackAreaSize: { number: 11.24, unit: 'cm' },
  };
}
