/**
 * A record of a shotgun stock's dimensions, and the tally of an eye dominance test.
 *
 * Nothing is recommended: the sheet holds what was measured, and the test tallies what the reader
 * saw. The definitions of the measurements and the test procedure are quoted with their sources on
 * the page; the dimensions a stock should have are a fitter's judgement for one shooter.
 */

import type { CastSide, EyeTrial, FitSheet, FitUnit } from './schemas/gun-fit';
import { MM_PER_INCH } from './sight-adjustment';

export type { CastSide, EyeTrial, FitSheet, FitUnit, SavedFitSheet } from './schemas/gun-fit';

export const FIT_SOURCES = {
  checkedOn: '2026-09-24',
  orvis: { name: 'Orvis, Shotgun Stock & Measurements', url: 'https://www.orvis.com/shotgun-stock-measurements.html' },
  browning: {
    name: 'Browning, How do you determine the proper fit of your shotgun stock?',
    url: 'https://www.browning.com/support/faq/fit-gun-stock.html',
  },
  eye: {
    name: 'Lopes-Ferreira D. et al., Ocular Dominance and Visual Function Testing, BioMed Research International 2013:238943',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3844205/',
  },
} as const;

export const emptyFitSheet = (): FitSheet => ({
  name: '',
  shooter: '',
  unit: 'mm',
  lengthOfPull: null,
  dropAtComb: null,
  dropAtHeel: null,
  cast: null,
  castSide: 'none',
  note: '',
});

/** The same length in the other unit, rounded to what a tape reads: 0.5 mm or 1/100 inch. */
export function convertFitLength(value: number | null, from: FitUnit, to: FitUnit): number | null {
  if (value === null || from === to) return value;
  return to === 'inch' ? Math.round((value / MM_PER_INCH) * 100) / 100 : Math.round(value * MM_PER_INCH * 2) / 2;
}

export function convertFitSheet(sheet: FitSheet, unit: FitUnit): FitSheet {
  return {
    ...sheet,
    unit,
    lengthOfPull: convertFitLength(sheet.lengthOfPull, sheet.unit, unit),
    dropAtComb: convertFitLength(sheet.dropAtComb, sheet.unit, unit),
    dropAtHeel: convertFitLength(sheet.dropAtHeel, sheet.unit, unit),
    cast: convertFitLength(sheet.cast, sheet.unit, unit),
  };
}

export interface EyeTally {
  right: number;
  left: number;
  unclear: number;
  trials: number;
  /** The eye seen in more than half of the trials, or null when none is. */
  dominant: 'right' | 'left' | null;
}

/**
 * Counts the trials. An eye is named only when it was seen in more than half of them: the test is
 * a sighting test, and a reader whose trials split has not shown a sighting preference with it.
 */
export function tallyEyeTrials(trials: readonly EyeTrial[]): EyeTally {
  const count = (eye: EyeTrial) => trials.filter((trial) => trial === eye).length;
  const right = count('right');
  const left = count('left');
  const half = trials.length / 2;
  return {
    right,
    left,
    unclear: count('unclear'),
    trials: trials.length,
    dominant: right > half ? 'right' : left > half ? 'left' : null,
  };
}

export const castSideLabel = (side: CastSide, language: 'ja' | 'en') =>
  ({
    left: { ja: '左へ', en: 'to the left' },
    right: { ja: '右へ', en: 'to the right' },
    none: { ja: 'なし', en: 'none' },
  })[side][language];
