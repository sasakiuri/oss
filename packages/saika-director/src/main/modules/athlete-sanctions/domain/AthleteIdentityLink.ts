export const ATHLETE_IDENTITY_LINK_ENTRY_TYPES = ['LINKED', 'UNLINKED'] as const;
export const ATHLETE_IDENTITY_LINK_BASES = ['ISSF_ID', 'MANUAL'] as const;

export type AthleteIdentityLinkEntryType = (typeof ATHLETE_IDENTITY_LINK_ENTRY_TYPES)[number];
export type AthleteIdentityLinkBasis = (typeof ATHLETE_IDENTITY_LINK_BASES)[number];

export class AthleteIdentityLinkEntry {
  private constructor(
    readonly id: string,
    readonly athleteIdentityId: string,
    readonly participantId: string,
    readonly eventIdSnapshot: string,
    readonly eventNameSnapshot: string,
    readonly playerNameSnapshot: string,
    readonly issfIdSnapshot: string | null,
    readonly entryType: AthleteIdentityLinkEntryType,
    readonly linkBasis: AthleteIdentityLinkBasis,
    readonly statement: string,
    readonly officialName: string,
    readonly recordedAt: Date,
    readonly reversesLinkId: string | null,
  ) {
    Object.freeze(this);
  }

  static link(props: {
    id?: string;
    athleteIdentityId: string;
    participantId: string;
    eventIdSnapshot: string;
    eventNameSnapshot: string;
    playerNameSnapshot: string;
    issfIdSnapshot?: string | null;
    linkBasis: AthleteIdentityLinkBasis;
    statement: string;
    officialName: string;
    recordedAt?: Date;
  }): AthleteIdentityLinkEntry {
    return AthleteIdentityLinkEntry.build({ ...props, entryType: 'LINKED', reversesLinkId: null });
  }

  static unlink(
    link: AthleteIdentityLinkEntry,
    props: { id?: string; statement: string; officialName: string; recordedAt?: Date },
  ): AthleteIdentityLinkEntry {
    if (link.entryType !== 'LINKED') throw new Error('Only an athlete identity link can be unlinked');
    return AthleteIdentityLinkEntry.build({
      ...props,
      athleteIdentityId: link.athleteIdentityId,
      participantId: link.participantId,
      eventIdSnapshot: link.eventIdSnapshot,
      eventNameSnapshot: link.eventNameSnapshot,
      playerNameSnapshot: link.playerNameSnapshot,
      issfIdSnapshot: link.issfIdSnapshot,
      entryType: 'UNLINKED',
      linkBasis: link.linkBasis,
      reversesLinkId: link.id,
    });
  }

  static reconstruct(props: {
    id: string;
    athleteIdentityId: string;
    participantId: string;
    eventIdSnapshot: string;
    eventNameSnapshot: string;
    playerNameSnapshot: string;
    issfIdSnapshot: string | null;
    entryType: AthleteIdentityLinkEntryType;
    linkBasis: AthleteIdentityLinkBasis;
    statement: string;
    officialName: string;
    recordedAt: Date;
    reversesLinkId: string | null;
  }): AthleteIdentityLinkEntry {
    return AthleteIdentityLinkEntry.build(props);
  }

  private static build(props: {
    id?: string;
    athleteIdentityId: string;
    participantId: string;
    eventIdSnapshot: string;
    eventNameSnapshot: string;
    playerNameSnapshot: string;
    issfIdSnapshot?: string | null;
    entryType: AthleteIdentityLinkEntryType;
    linkBasis: AthleteIdentityLinkBasis;
    statement: string;
    officialName: string;
    recordedAt?: Date;
    reversesLinkId: string | null;
  }): AthleteIdentityLinkEntry {
    if (!ATHLETE_IDENTITY_LINK_ENTRY_TYPES.includes(props.entryType)) throw new Error('entryType is invalid');
    if (!ATHLETE_IDENTITY_LINK_BASES.includes(props.linkBasis)) throw new Error('linkBasis is invalid');
    if ((props.entryType === 'LINKED') !== (props.reversesLinkId === null)) {
      throw new Error('Only UNLINKED entries may reverse an athlete identity link');
    }
    return new AthleteIdentityLinkEntry(
      props.id ? requiredText(props.id, 'id') : crypto.randomUUID(),
      requiredText(props.athleteIdentityId, 'athleteIdentityId'),
      requiredText(props.participantId, 'participantId'),
      requiredText(props.eventIdSnapshot, 'eventIdSnapshot'),
      requiredText(props.eventNameSnapshot, 'eventNameSnapshot'),
      requiredText(props.playerNameSnapshot, 'playerNameSnapshot'),
      optionalText(props.issfIdSnapshot),
      props.entryType,
      props.linkBasis,
      requiredText(props.statement, 'statement'),
      requiredText(props.officialName, 'officialName'),
      validDate(props.recordedAt ?? new Date(), 'recordedAt'),
      props.reversesLinkId ? requiredText(props.reversesLinkId, 'reversesLinkId') : null,
    );
  }
}

function optionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function getActiveAthleteIdentityLinks(
  history: readonly AthleteIdentityLinkEntry[],
): AthleteIdentityLinkEntry[] {
  const reversed = new Set(history.flatMap((entry) => (entry.reversesLinkId ? [entry.reversesLinkId] : [])));
  return history.filter((entry) => entry.entryType === 'LINKED' && !reversed.has(entry.id)).sort(compareEntries);
}

function compareEntries(left: AthleteIdentityLinkEntry, right: AthleteIdentityLinkEntry): number {
  return left.recordedAt.getTime() - right.recordedAt.getTime() || left.id.localeCompare(right.id);
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
