export interface FinalResultDeclarationProps {
  readonly id?: string;
  readonly eventId: string;
  readonly snapshotRevision: string;
  readonly approvalId: string;
  readonly finalProtestsResolved: boolean;
  readonly resultProcessConfirmed: boolean;
  readonly statement: string;
  readonly officialName: string;
  readonly ruleReference?: string;
  readonly declaredAt?: Date;
}

/** Immutable declaration made after Final protests and RTS verification are complete. */
export class FinalResultDeclaration {
  private constructor(
    readonly id: string,
    readonly eventId: string,
    readonly snapshotRevision: string,
    readonly approvalId: string,
    readonly finalProtestsResolved: true,
    readonly resultProcessConfirmed: true,
    readonly statement: string,
    readonly officialName: string,
    readonly ruleReference: string,
    readonly declaredAt: Date,
  ) {
    Object.freeze(this);
  }

  static create(props: FinalResultDeclarationProps): FinalResultDeclaration {
    if (!props.finalProtestsResolved) throw new Error('All immediate Final protests must be resolved');
    if (!props.resultProcessConfirmed) throw new Error('The Final results process must be confirmed');
    return new FinalResultDeclaration(
      props.id ?? crypto.randomUUID(),
      requiredText(props.eventId, 'eventId'),
      validRevision(props.snapshotRevision),
      requiredText(props.approvalId, 'approvalId'),
      true,
      true,
      requiredText(props.statement, 'statement'),
      requiredText(props.officialName, 'officialName'),
      requiredText(
        props.ruleReference ?? 'ISSF 6.14.5 / 6.17.1.7 / 6.17.1.13 / 6.17.2(i) / 6.17.3(j) / 6.18.4.2',
        'ruleReference',
      ),
      validDate(props.declaredAt ?? new Date()),
    );
  }

  static reconstruct(props: Required<FinalResultDeclarationProps>): FinalResultDeclaration {
    return FinalResultDeclaration.create(props);
  }
}

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function validRevision(value: string): string {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('snapshotRevision must be a SHA-256 digest');
  return value;
}

function validDate(value: Date): Date {
  if (!Number.isFinite(value.getTime())) throw new Error('declaredAt must be valid');
  return new Date(value.getTime());
}
