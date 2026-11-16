import type { AthleteSanctionWorkspaceDto } from '@/shared/ipc/contracts';

import type { AuthorityBasis, ClassificationCode, DsqBasis, OfficialRole } from './athleteSanctionTypes';

/** Event entries not linked to any championship identity. */
export function unlinkedEntries(workspace: AthleteSanctionWorkspaceDto) {
  const linked = new Set(workspace.activeLinks.map((link) => link.participantId));
  return workspace.participantEntries.filter((entry) => !linked.has(entry.participantId));
}

/** The identity's active links with the current entry names, or the snapshot names of archived entries. */
export function linkedEntries(workspace: AthleteSanctionWorkspaceDto, identityId: string) {
  return workspace.activeLinks
    .filter((link) => link.athleteIdentityId === identityId)
    .map((link) => {
      const entry = workspace.participantEntries.find((candidate) => candidate.participantId === link.participantId);
      return {
        link,
        playerName: entry?.playerName ?? link.playerNameSnapshot,
        eventName: entry?.eventName ?? `${link.eventNameSnapshot} (archived entry)`,
      };
    });
}

/** The events of the identity's linked entries, in entry order, each once. */
export function linkedEventIds(workspace: AthleteSanctionWorkspaceDto, identityId: string): string[] {
  const participantIds = new Set(
    workspace.activeLinks.filter((link) => link.athleteIdentityId === identityId).map((link) => link.participantId),
  );
  return [
    ...new Set(
      workspace.participantEntries
        .filter((entry) => participantIds.has(entry.participantId))
        .map((entry) => entry.eventId),
    ),
  ];
}

/** The authority basis and official role recorded with a sanction. */
export function sanctionAuthority(
  code: ClassificationCode,
  dsqBasis: DsqBasis,
): { basis: AuthorityBasis; role: OfficialRole } {
  if (code === 'AD_DSQ') return { basis: 'ANTI_DOPING_DECISION', role: 'ANTI_DOPING_AUTHORITY' };
  if (code === 'DQB') return { basis: 'JURY_MAJORITY', role: 'JURY_MEMBER' };
  return dsqBasis === 'POST_COMPETITION_CHECK'
    ? { basis: dsqBasis, role: 'EQUIPMENT_CONTROL_JURY' }
    : { basis: dsqBasis, role: 'JURY_MEMBER' };
}
