export const PROTEST_ENTRY_TYPES = [
  'FORWARDED_TO_JURY',
  'DECIDED_UPHELD',
  'DECIDED_PARTLY_UPHELD',
  'DECIDED_REJECTED',
  'FEE_REFUNDED',
  'FEE_RETAINED',
  'NOTE',
  'CLOSED',
  'VOID',
] as const;
export type ProtestEntryType = (typeof PROTEST_ENTRY_TYPES)[number];

export class ProtestEntry {
  private constructor(
    readonly id: string,
    readonly caseId: string,
    readonly type: ProtestEntryType,
    readonly statement: string,
    readonly officialName: string,
    readonly ruleReference: string | null,
    readonly occurredAt: Date,
    readonly recordedAt: Date,
  ) {
    Object.freeze(this);
  }

  static create(props: {
    id?: string;
    caseId: string;
    type: ProtestEntryType;
    statement: string;
    officialName: string;
    ruleReference?: string | null;
    occurredAt: Date;
    recordedAt?: Date;
  }): ProtestEntry {
    if (!PROTEST_ENTRY_TYPES.includes(props.type)) throw new Error('Protest entry type is invalid');
    const text = (value: string, name: string) => {
      const normalized = value.trim();
      if (!normalized) throw new Error(`${name} is required`);
      return normalized;
    };
    return new ProtestEntry(
      props.id ?? crypto.randomUUID(),
      text(props.caseId, 'caseId'),
      props.type,
      text(props.statement, 'statement'),
      text(props.officialName, 'officialName'),
      props.ruleReference?.trim() || null,
      new Date(props.occurredAt),
      new Date(props.recordedAt ?? new Date()),
    );
  }

  static reconstruct(
    props: Parameters<typeof ProtestEntry.create>[0] & { id: string; recordedAt: Date },
  ): ProtestEntry {
    return ProtestEntry.create(props);
  }
}

export function protestStatus(entries: readonly ProtestEntry[]): 'OPEN' | 'DECIDED' | 'CLOSED' | 'VOID' {
  let status: 'OPEN' | 'DECIDED' | 'CLOSED' | 'VOID' = 'OPEN';
  for (const entry of entries) {
    if (entry.type.startsWith('DECIDED_')) status = 'DECIDED';
    if (entry.type === 'CLOSED') status = 'CLOSED';
    if (entry.type === 'VOID') status = 'VOID';
  }
  return status;
}
