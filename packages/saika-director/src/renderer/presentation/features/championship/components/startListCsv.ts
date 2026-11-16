import type { StartListVersionDto } from '@/shared/ipc/contracts';

const COLUMNS = [
  'Relay',
  'Firing point',
  'Bib',
  'ISSF ID',
  'Athlete',
  'Family name',
  'Nation',
  'Affiliation',
  'Status',
  'Team',
];

/**
 * The CSV snapshot of a Start List version as the operator downloads it: a UTF-8 byte order mark, every cell quoted,
 * values that a spreadsheet would evaluate prefixed with an apostrophe, and CRLF between records.
 */
export function startListCsv(version: StartListVersionDto): string {
  const rows = version.rows.map((row) => [
    row.relayNumber ?? '',
    row.firingPointNumber ?? '',
    row.startNumber ?? '',
    row.issfId ?? '',
    row.athleteName,
    row.familyName,
    row.nationCode ?? '',
    row.affiliation,
    row.entryStatus,
    row.teamName ?? row.teamId ?? '',
  ]);
  const csv = [COLUMNS, ...rows].map((record) => record.map(csvCell).join(',')).join('\r\n');
  return `\uFEFF${csv}`;
}

/** `<event name with unsafe characters as hyphens>-<list kind>-v<version>.csv` */
export function startListCsvFileName(version: StartListVersionDto): string {
  return `${safeFilename(version.eventNameSnapshot)}-${version.listKind.toLowerCase()}-v${version.versionNumber}.csv`;
}

function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function safeFilename(value: string): string {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-|-$/g, '') || 'start-list'
  );
}
