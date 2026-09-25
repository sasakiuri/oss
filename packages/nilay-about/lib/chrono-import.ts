/**
 * Reading the velocities out of a chronograph's exported file.
 *
 * Two layouts are read, both checked against real exported files (2026-09-24), since neither maker
 * publishes a specification:
 *
 * - Garmin ShotView (Xero C1) CSV: a session name, a header row beginning `#,` whose second column
 *   names the speed and its unit in brackets, one row per shot, then a row beginning `-` before the
 *   averages. Column names, the unit (FPS or MPS) and the decimal separator follow the phone's
 *   language, so the header is recognised by its shape and the unit in brackets, not by its words.
 * - LabRadar (the original unit) `SR#### Report.csv`: `sep=;`, a block of settings including
 *   `Units velocity;fps;;`, then a `Shot ID;V0;…` header and one row per shot. Lines are padded with
 *   NUL characters, which are removed first. Only fps has been seen in a real file, so a file in any
 *   other unit is refused rather than guessed at.
 *
 * Garmin's FIT files are not read: the FIT SDK's licence forbids redistributing it, and its protocol
 * documentation is Garmin's confidential information under that licence.
 */

import type { SpeedUnit } from './schemas/trajectory';

export type ChronoFormat = 'shotview' | 'labradar';

export type ChronoImport =
  | { kind: 'ok'; format: ChronoFormat; unit: SpeedUnit; velocities: number[]; session: string | null }
  | { kind: 'error'; problem: 'unknown-format' | 'no-shots' | 'unit' };

/** Split one line of delimited text, honouring double quotes and doubled quotes inside them. */
export function splitDelimited(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) {
      cells.push(cell);
      cell = '';
    } else cell += char;
  }
  cells.push(cell);
  return cells.map((value) => value.trim());
}

/** A number written with either a decimal point or a decimal comma, as the phone's language had it. */
function readNumber(text: string): number | null {
  const normalised = text.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalised)) return null;
  const value = Number(normalised);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function readShotView(lines: string[]): ChronoImport | null {
  const headerIndex = lines.findIndex((line) => line.startsWith('#,'));
  if (headerIndex < 0) return null;
  const header = splitDelimited(lines[headerIndex] as string, ',');
  const unitMatch = /\((FPS|MPS)\)/i.exec(header[1] ?? '');
  if (!unitMatch) return { kind: 'error', problem: 'unit' };
  const unit: SpeedUnit = (unitMatch[1] as string).toUpperCase() === 'FPS' ? 'fps' : 'mps';
  const velocities: number[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (line.startsWith('-')) break;
    const cells = splitDelimited(line, ',');
    if (!/^\d+$/.test(cells[0] ?? '')) continue;
    const value = readNumber(cells[1] ?? '');
    if (value !== null) velocities.push(value);
  }
  if (velocities.length === 0) return { kind: 'error', problem: 'no-shots' };
  const first = lines[0] ?? '';
  const session = headerIndex > 0 ? first.replace(/^"|"$/g, '').trim() || null : null;
  return { kind: 'ok', format: 'shotview', unit, velocities, session };
}

function readLabRadar(lines: string[]): ChronoImport | null {
  if (!/^sep=;/i.test(lines[0] ?? '')) return null;
  const rows = lines.map((line) => splitDelimited(line, ';'));
  const unitRow = rows.find((cells) => cells[0] === 'Units velocity');
  const headerIndex = rows.findIndex((cells) => cells[0] === 'Shot ID');
  if (!unitRow || headerIndex < 0) return null;
  if (unitRow[1] !== 'fps') return { kind: 'error', problem: 'unit' };
  const column = (rows[headerIndex] as string[]).indexOf('V0');
  if (column < 0) return null;
  const velocities = rows
    .slice(headerIndex + 1)
    .filter((cells) => /^\d+$/.test(cells[0] ?? ''))
    .map((cells) => readNumber(cells[column] ?? ''))
    .filter((value): value is number => value !== null);
  if (velocities.length === 0) return { kind: 'error', problem: 'no-shots' };
  const series = rows.find((cells) => cells[0] === 'Series No')?.[1] ?? null;
  return { kind: 'ok', format: 'labradar', unit: 'fps', velocities, session: series ? `SR${series}` : null };
}

export function readChronographFile(text: string): ChronoImport {
  const lines = text
    .replace(/\u0000/g, '')
    .replace(/\uFEFF/g, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  return readLabRadar(lines) ?? readShotView(lines) ?? { kind: 'error', problem: 'unknown-format' };
}
