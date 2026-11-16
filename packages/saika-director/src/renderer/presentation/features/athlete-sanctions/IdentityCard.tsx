import { useState } from 'react';
import { Ban, Link2, Unlink } from 'lucide-react';

import { useConfirmDialogStore } from '@/renderer/presentation/stores/ui/confirmDialog.store';
import type { AthleteIdentityDto, AthleteSanctionWorkspaceDto } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';

import { linkedEntries, unlinkedEntries } from './athleteSanctionRules';
import type { AthleteSanctionCommands, LinkBasis } from './athleteSanctionTypes';
import { sanctionInputClass, sanctionSectionClass } from './sanctionFormClasses';

interface IdentityCardProps {
  identity: AthleteIdentityDto;
  workspace: AthleteSanctionWorkspaceDto;
  officialName: string;
  statement: string;
  busy: boolean;
  onSanction: () => void;
  commands: Pick<AthleteSanctionCommands, 'linkParticipant' | 'unlinkParticipant'>;
}

/** One championship identity with its linked event entries. */
export function IdentityCard({
  identity,
  workspace,
  officialName,
  statement,
  busy,
  onSanction,
  commands,
}: IdentityCardProps) {
  const entries = linkedEntries(workspace, identity.id);
  const available = unlinkedEntries(workspace);
  const [participantId, setParticipantId] = useState('');
  const [basis, setBasis] = useState<LinkBasis>('MANUAL');

  const link = async () => {
    const linked = await commands.linkParticipant({
      athleteIdentityId: identity.id,
      participantId,
      linkBasis: basis,
      statement: statement.trim(),
      officialName: officialName.trim(),
    });
    if (linked) setParticipantId('');
  };

  const unlinkEntry = async (linkId: string, label: string) => {
    if (!(await useConfirmDialogStore.getState().openConfirm(`Unlink ${label} from this identity?`))) return;
    await commands.unlinkParticipant({
      linkId,
      statement: statement.trim(),
      officialName: officialName.trim(),
    });
  };

  return (
    <article className={sanctionSectionClass}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold text-vscode-text">{identity.displayName}</h3>
          <p className="text-xs text-vscode-text-muted">ISSF ID: {identity.issfId ?? 'manual identity'}</p>
        </div>
        <Button size="sm" disabled={busy || entries.length === 0} onClick={onSanction}>
          <Ban size={13} aria-hidden="true" /> Record sanction
        </Button>
      </div>
      <ul className="mt-3 divide-y divide-vscode-border border-y border-vscode-border">
        {entries.map(({ link: activeLink, playerName, eventName }) => (
          <li key={activeLink.id} className="flex items-center justify-between gap-2 py-2 text-xs">
            <span>
              <span className="font-medium text-vscode-text">{playerName}</span>
              <span className="block text-vscode-text-muted">
                {eventName} · {activeLink.linkBasis}
              </span>
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || !officialName.trim() || !statement.trim()}
              onClick={() => void unlinkEntry(activeLink.id, `${playerName} / ${eventName}`)}
            >
              <Unlink size={12} aria-hidden="true" /> Unlink
            </Button>
          </li>
        ))}
      </ul>
      {available.length > 0 && (
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
          <select
            className={sanctionInputClass}
            value={participantId}
            onChange={(event) => setParticipantId(event.target.value)}
          >
            <option value="">Link another event entry</option>
            {available.map((entry) => (
              <option key={entry.participantId} value={entry.participantId}>
                {entry.playerName} — {entry.eventName}
              </option>
            ))}
          </select>
          <select
            className={sanctionInputClass}
            value={basis}
            onChange={(event) => setBasis(event.target.value as LinkBasis)}
          >
            <option value="MANUAL">Manual review</option>
            <option value="ISSF_ID">ISSF ID</option>
          </select>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || !participantId || !officialName.trim() || !statement.trim()}
            onClick={() => void link()}
          >
            <Link2 size={12} aria-hidden="true" /> Link
          </Button>
        </div>
      )}
    </article>
  );
}
