import { useState } from 'react';
import { Undo2 } from 'lucide-react';

import { useConfirmDialogStore } from '@/renderer/presentation/stores/ui/confirmDialog.store';
import type { AthleteSanctionDecisionDto, AthleteSanctionWorkspaceDto } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';

import type { AthleteSanctionCommands } from './athleteSanctionTypes';
import { Field } from './Field';
import { sanctionInputClass, sanctionSectionClass } from './sanctionFormClasses';

interface ActiveSanctionsProps {
  workspace: AthleteSanctionWorkspaceDto;
  defaultOfficialName: string;
  busy: boolean;
  commands: Pick<AthleteSanctionCommands, 'revokeSanction'>;
}

/**
 * The active sanctions and the revocation form. The revoking official starts from the recording official when the
 * list first appears.
 */
export function ActiveSanctions({ workspace, defaultOfficialName, busy, commands }: ActiveSanctionsProps) {
  const [target, setTarget] = useState<AthleteSanctionDecisionDto | null>(null);
  const [officialName, setOfficialName] = useState(defaultOfficialName);
  const [authorityReference, setAuthorityReference] = useState('');
  const [ruleReference, setRuleReference] = useState('ISSF Jury correction');
  const [reason, setReason] = useState('');

  const revoke = async () => {
    if (!target) return;
    const identity = workspace.identities.find((candidate) => candidate.id === target.athleteIdentityId);
    if (
      !(await useConfirmDialogStore
        .getState()
        .openConfirm(`Revoke ${target.classificationCode} for ${identity?.displayName ?? 'this athlete'}?`))
    )
      return;
    const revoked = await commands.revokeSanction({
      decisionId: target.id,
      authorityBasis: target.authorityBasis,
      authorityReference: authorityReference.trim(),
      officialName: officialName.trim(),
      officialRole: target.officialRole,
      ruleReference: ruleReference.trim(),
      reason: reason.trim(),
      decidedAt: new Date().toISOString(),
    });
    if (revoked) {
      setTarget(null);
      setReason('');
    }
  };

  return (
    <section className={sanctionSectionClass}>
      <h3 className="text-[13px] font-semibold text-vscode-text">Active sanctions</h3>
      <ul className="mt-2 divide-y divide-vscode-border border-y border-vscode-border">
        {workspace.activeSanctions.map((sanction) => {
          const identity = workspace.identities.find((candidate) => candidate.id === sanction.athleteIdentityId);
          const sourceEvent = workspace.participantEntries.find((entry) => entry.eventId === sanction.sourceEventId);
          return (
            <li key={sanction.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-xs">
              <span>
                <span className="font-semibold text-vscode-warning">{sanction.classificationCode}</span>{' '}
                <span className="font-medium text-vscode-text">
                  {identity?.displayName ?? sanction.athleteIdentityId}
                </span>
                <span className="block text-vscode-text-muted">
                  {sanction.scope} · {sourceEvent?.eventName ?? sanction.sourceEventId} · {sanction.publicRemark}
                </span>
              </span>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setTarget(sanction)}>
                <Undo2 size={12} aria-hidden="true" /> Revoke
              </Button>
            </li>
          );
        })}
      </ul>
      {target && (
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Revoking official">
            <input
              className={sanctionInputClass}
              value={officialName}
              onChange={(event) => setOfficialName(event.target.value)}
            />
          </Field>
          <Field label="Authority reference">
            <input
              className={sanctionInputClass}
              value={authorityReference}
              onChange={(event) => setAuthorityReference(event.target.value)}
            />
          </Field>
          <Field label="Rule reference">
            <input
              className={sanctionInputClass}
              value={ruleReference}
              onChange={(event) => setRuleReference(event.target.value)}
            />
          </Field>
          <Field label="Public revocation reason">
            <input className={sanctionInputClass} value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <div className="flex gap-2 xl:col-span-4 xl:justify-end">
            <Button size="sm" variant="secondary" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={
                busy || !officialName.trim() || !authorityReference.trim() || !ruleReference.trim() || !reason.trim()
              }
              onClick={() => void revoke()}
            >
              Confirm revocation
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
