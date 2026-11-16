import { useState } from 'react';

import type { AthleteSanctionWorkspaceDto } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';

import { unlinkedEntries } from './athleteSanctionRules';
import type { AthleteSanctionCommands, LinkBasis } from './athleteSanctionTypes';
import { Field } from './Field';
import { sanctionInputClass, sanctionSectionClass } from './sanctionFormClasses';

interface CreateIdentityFormProps {
  workspace: AthleteSanctionWorkspaceDto;
  officialName: string;
  statement: string;
  disabled: boolean;
  onCancel: () => void;
  onCreated: () => void;
  commands: Pick<AthleteSanctionCommands, 'createIdentity'>;
}

/** A reviewed identity for unlinked event entries; its draft is discarded when the form closes. */
export function CreateIdentityForm({
  workspace,
  officialName,
  statement,
  disabled,
  onCancel,
  onCreated,
  commands,
}: CreateIdentityFormProps) {
  const available = unlinkedEntries(workspace);
  const [displayName, setDisplayName] = useState('');
  const [issfId, setIssfId] = useState('');
  const [basis, setBasis] = useState<LinkBasis>('MANUAL');
  const [participantIds, setParticipantIds] = useState<string[]>([]);

  const submit = async () => {
    const created = await commands.createIdentity({
      championshipId: workspace.championshipId,
      displayName: displayName.trim(),
      ...(issfId.trim() ? { issfId: issfId.trim() } : {}),
      participantIds,
      linkBasis: basis,
      statement: statement.trim(),
      officialName: officialName.trim(),
    });
    if (created) onCreated();
  };

  return (
    <section className={sanctionSectionClass}>
      <h3 className="text-[13px] font-semibold text-vscode-text">Create reviewed identity</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Field label="Display name">
          <input
            className={sanctionInputClass}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </Field>
        <Field label="ISSF ID (optional)">
          <input className={sanctionInputClass} value={issfId} onChange={(event) => setIssfId(event.target.value)} />
        </Field>
        <Field label="Link basis">
          <select
            className={sanctionInputClass}
            value={basis}
            onChange={(event) => setBasis(event.target.value as LinkBasis)}
          >
            <option value="MANUAL">Reviewed manual match</option>
            <option value="ISSF_ID">Exact ISSF ID match</option>
          </select>
        </Field>
      </div>
      <fieldset className="mt-3">
        <legend className="text-xs font-medium text-vscode-text-muted">
          Event entries represented by this athlete
        </legend>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {available.map((entry) => (
            <label key={entry.participantId} className="flex items-start gap-2 text-xs text-vscode-text">
              <input
                type="checkbox"
                checked={participantIds.includes(entry.participantId)}
                onChange={(event) =>
                  setParticipantIds((current) =>
                    event.target.checked
                      ? [...current, entry.participantId]
                      : current.filter((id) => id !== entry.participantId),
                  )
                }
              />
              <span>
                {entry.playerName} · {entry.eventName}
                <span className="block text-vscode-dimmed">ISSF ID: {entry.issfId ?? 'none'}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={
            disabled ||
            !displayName.trim() ||
            participantIds.length === 0 ||
            !officialName.trim() ||
            !statement.trim() ||
            (basis === 'ISSF_ID' && !issfId.trim())
          }
          onClick={() => void submit()}
        >
          Create identity
        </Button>
      </div>
    </section>
  );
}
