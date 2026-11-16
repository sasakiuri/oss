import { requiredText, validDate } from '@/main/domain/guards';

export class AthleteIdentity {
  private constructor(
    readonly id: string,
    readonly championshipId: string,
    readonly displayName: string,
    readonly issfId: string | null,
    readonly createdBy: string,
    readonly creationStatement: string,
    readonly createdAt: Date,
  ) {
    Object.freeze(this);
  }

  static create(props: {
    id?: string;
    championshipId: string;
    displayName: string;
    issfId?: string | null;
    createdBy: string;
    creationStatement: string;
    createdAt?: Date;
  }): AthleteIdentity {
    return new AthleteIdentity(
      props.id ? requiredText(props.id, 'id') : crypto.randomUUID(),
      requiredText(props.championshipId, 'championshipId'),
      requiredText(props.displayName, 'displayName'),
      normalizeIssfId(props.issfId),
      requiredText(props.createdBy, 'createdBy'),
      requiredText(props.creationStatement, 'creationStatement'),
      validDate(props.createdAt ?? new Date(), 'createdAt'),
    );
  }

  static reconstruct(props: {
    id: string;
    championshipId: string;
    displayName: string;
    issfId: string | null;
    createdBy: string;
    creationStatement: string;
    createdAt: Date;
  }): AthleteIdentity {
    return AthleteIdentity.create(props);
  }
}

export function normalizeIssfId(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized ? normalized : null;
}
