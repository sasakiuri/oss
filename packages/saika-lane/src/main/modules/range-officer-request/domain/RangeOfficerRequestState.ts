export const RANGE_OFFICER_REQUEST_CATEGORIES = [
  'ASSISTANCE',
  'EQUIPMENT',
  'TARGET',
  'SCORING',
  'SAFETY',
  'OTHER',
] as const;

export type RangeOfficerRequestCategory = (typeof RANGE_OFFICER_REQUEST_CATEGORIES)[number];
export type RangeOfficerRequestStatus = 'ACTIVE' | 'CLEARED';

export interface RangeOfficerRequestStateProps {
  requestId: string;
  status: RangeOfficerRequestStatus;
  category: RangeOfficerRequestCategory;
  message: string | null;
  requestedAt: Date;
  clearedAt?: Date | null;
  clearedBy?: string | null;
}

/** Lane-owned assistance signal. It never changes firing, timer, or safety state. */
export class RangeOfficerRequestState {
  private constructor(
    readonly requestId: string,
    readonly status: RangeOfficerRequestStatus,
    readonly category: RangeOfficerRequestCategory,
    readonly message: string | null,
    readonly requestedAt: Date,
    readonly clearedAt: Date | null,
    readonly clearedBy: string | null,
  ) {
    Object.freeze(this);
  }

  static request(input: {
    requestId?: string;
    category: RangeOfficerRequestCategory;
    message?: string | null;
    requestedAt?: Date;
  }): RangeOfficerRequestState {
    return RangeOfficerRequestState.create({
      requestId: input.requestId ?? crypto.randomUUID(),
      status: 'ACTIVE',
      category: input.category,
      message: input.message ?? null,
      requestedAt: input.requestedAt ?? new Date(),
    });
  }

  static create(props: RangeOfficerRequestStateProps): RangeOfficerRequestState {
    if (!RANGE_OFFICER_REQUEST_CATEGORIES.includes(props.category)) throw new Error('category is invalid');
    const requestedAt = validDate(props.requestedAt, 'requestedAt');
    const clearedAt = props.clearedAt ? validDate(props.clearedAt, 'clearedAt') : null;
    if (props.status === 'ACTIVE' && (clearedAt || props.clearedBy)) {
      throw new Error('An active Range Officer request cannot contain clearance data');
    }
    if (props.status === 'CLEARED' && (!clearedAt || !props.clearedBy?.trim())) {
      throw new Error('A cleared Range Officer request requires clearedAt and clearedBy');
    }
    if (clearedAt && clearedAt < requestedAt) throw new Error('clearedAt cannot precede requestedAt');
    const message = props.message?.trim() || null;
    if (message && message.length > 500) throw new Error('message must be at most 500 characters');
    return new RangeOfficerRequestState(
      requiredText(props.requestId, 'requestId'),
      props.status,
      props.category,
      message,
      requestedAt,
      clearedAt,
      props.clearedBy?.trim() || null,
    );
  }

  clear(clearedBy: string, clearedAt = new Date()): RangeOfficerRequestState {
    if (this.status !== 'ACTIVE') throw new Error('No active Range Officer request to clear');
    return RangeOfficerRequestState.create({ ...this, status: 'CLEARED', clearedBy, clearedAt });
  }
}

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function validDate(value: Date, name: string): Date {
  if (!Number.isFinite(value.getTime())) throw new Error(`${name} must be valid`);
  return new Date(value.getTime());
}
