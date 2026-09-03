import { createHash } from 'node:crypto';

export type EvidenceScalar = string | number | boolean | null;
export type EvidenceRecord = Readonly<Record<string, EvidenceScalar>>;

export interface CompetitionEvidenceSummary {
  readonly id: string;
  readonly name: string;
  readonly date: string;
  readonly venue: string;
}

export interface CompetitionEvidenceSection {
  readonly id: string;
  readonly records: readonly EvidenceRecord[];
}

export interface ICompetitionEvidenceSource {
  getChampionship(championshipId: string): CompetitionEvidenceSummary | null;
  collect(championshipId: string): readonly CompetitionEvidenceSection[];
}

export interface EvidenceBundleSection extends CompetitionEvidenceSection {
  readonly recordCount: number;
  readonly sha256: string;
}

export interface CompetitionEvidenceBundle {
  readonly format: 'saika-competition-evidence';
  readonly formatVersion: 1;
  readonly generatedAt: string;
  readonly applicationVersion: string;
  readonly championship: CompetitionEvidenceSummary;
  readonly sections: readonly EvidenceBundleSection[];
  readonly bundleSha256: string;
}

export interface ArchiveClock {
  now(): Date;
}

export class CompetitionEvidenceBundleBuilder {
  constructor(
    private readonly applicationVersion: string,
    private readonly clock: ArchiveClock = { now: () => new Date() },
  ) {}

  build(source: ICompetitionEvidenceSource, championshipId: string): CompetitionEvidenceBundle {
    const championship = source.getChampionship(championshipId);
    if (!championship) throw new Error(`Championship ${championshipId} not found`);
    const sections = source
      .collect(championshipId)
      .map((section) => {
        const records = [...section.records].sort((left, right) =>
          canonicalJson(left).localeCompare(canonicalJson(right)),
        );
        return {
          id: requiredText(section.id, 'section.id'),
          records,
          recordCount: records.length,
          sha256: digest(canonicalJson(records)),
        };
      })
      .sort((left, right) => left.id.localeCompare(right.id));
    const unsigned = {
      format: 'saika-competition-evidence' as const,
      formatVersion: 1 as const,
      generatedAt: this.clock.now().toISOString(),
      applicationVersion: requiredText(this.applicationVersion, 'applicationVersion'),
      championship,
      sections,
    };
    return { ...unsigned, bundleSha256: digest(canonicalJson(unsigned)) };
  }
}

export function serializeEvidenceBundle(bundle: CompetitionEvidenceBundle): string {
  return `${canonicalJson(bundle)}\n`;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}
