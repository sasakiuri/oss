import type {
  StartListDistributionChannelDto,
  StartListDistributionModeDto,
  StartListFindingDto,
  StartListRowDto,
} from '@/shared/ipc/contracts';

const STARTING_STATUSES = new Set(['COMPETING', 'RPO', 'MQS', 'OOC']);

export function assessStartListRows(rows: readonly StartListRowDto[]): StartListFindingDto[] {
  const findings: StartListFindingDto[] = [];
  const unassigned = rows.filter((row) => STARTING_STATUSES.has(row.entryStatus) && row.relayNumber === null);
  if (unassigned.length > 0) {
    findings.push({
      code: 'STARTERS_WITHOUT_ALLOCATION',
      severity: 'BLOCKING',
      message: `${unassigned.length} starting athlete(s) have no relay and firing-point allocation.`,
      ruleReference: 'ISSF 6.6.5(a)',
    });
  }
  const nonStartersAssigned = rows.filter((row) => !STARTING_STATUSES.has(row.entryStatus) && row.relayNumber !== null);
  if (nonStartersAssigned.length > 0) {
    findings.push({
      code: 'NON_STARTERS_ALLOCATED',
      severity: 'WARNING',
      message: `${nonStartersAssigned.length} DNS/DNF/DSQ/DQB athlete(s) still have an allocation.`,
      ruleReference: 'ISSF 6.6.5(a)',
    });
  }
  const missingBib = rows.filter((row) => STARTING_STATUSES.has(row.entryStatus) && !row.startNumber);
  if (missingBib.length > 0) {
    findings.push({
      code: 'MISSING_START_NUMBER',
      severity: 'WARNING',
      message: `${missingBib.length} starting athlete(s) have no Bib/start number for range verification.`,
      ruleReference: 'ISSF 6.9.2(b)',
    });
  }
  const duplicateBib = duplicateValues(
    rows
      .filter((row) => STARTING_STATUSES.has(row.entryStatus))
      .flatMap((row) => (row.startNumber ? [row.startNumber] : [])),
  );
  if (duplicateBib.length > 0) {
    findings.push({
      code: 'DUPLICATE_START_NUMBER',
      severity: 'BLOCKING',
      message: `Duplicate Bib/start number(s): ${duplicateBib.join(', ')}.`,
      ruleReference: 'ISSF 6.9.2(b)',
    });
  }
  const missingNation = rows.filter((row) => STARTING_STATUSES.has(row.entryStatus) && !row.nationCode);
  if (missingNation.length > 0) {
    findings.push({
      code: 'MISSING_NATION_CODE',
      severity: 'WARNING',
      message: `${missingNation.length} starting athlete(s) have no official nation code.`,
      ruleReference: 'ISSF 6.6.5(a)',
    });
  }
  findings.push({
    code: 'PUBLICATION_DEADLINE_RECORDED',
    severity: 'INFO',
    message: 'The venue-local publication deadline is fixed in this version and checked when distribution is recorded.',
    ruleReference: 'ISSF 6.6.5(a)',
  });
  return findings;
}

export function assertDistributionCoverage(
  mode: StartListDistributionModeDto,
  channels: readonly StartListDistributionChannelDto[],
): void {
  const selected = new Set(channels);
  if (mode === 'PRINTED' && !selected.has('PRINT')) {
    throw new Error('Printed distribution must include the PRINT channel');
  }
  if (
    mode === 'PAPERLESS' &&
    ((!selected.has('EMAIL') && !selected.has('VENUE_WIFI')) || !selected.has('PUBLIC_INFORMATION_STATION'))
  ) {
    throw new Error('Paperless distribution requires email or venue Wi-Fi plus a public information station');
  }
}

function duplicateValues(values: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort();
}
