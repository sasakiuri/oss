import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, Link2, Plus, RefreshCw, ShieldAlert, Undo2, Unlink } from 'lucide-react';

import { athleteSanctionsService } from '@/renderer/services';
import { useConfirmDialogStore } from '@/renderer/presentation/stores/ui/confirmDialog.store';
import type {
  AthleteIdentityDto,
  AthleteSanctionDecisionDto,
  AthleteSanctionWorkspaceDto,
} from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';

type ClassificationCode = AthleteSanctionDecisionDto['classificationCode'];
type AuthorityBasis = AthleteSanctionDecisionDto['authorityBasis'];
type OfficialRole = AthleteSanctionDecisionDto['officialRole'];

export function AthleteSanctionsPanel({ championshipId }: { championshipId: string }) {
  const [workspace, setWorkspace] = useState<AthleteSanctionWorkspaceDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [officialName, setOfficialName] = useState('');
  const [auditStatement, setAuditStatement] = useState('Official entries reconciled against the ISSF ID');
  const [showCreate, setShowCreate] = useState(false);
  const [sanctionIdentityId, setSanctionIdentityId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const response = await athleteSanctionsService.getWorkspace({ championshipId });
    if (!response.success) setError(response.error.message);
    else setWorkspace(response.data);
  }, [championshipId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (operation: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const message = await operation();
      if (message) setNotice(message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const synchronize = async () => {
    if (!officialName.trim() || !auditStatement.trim()) return;
    await run(async () => {
      const response = await athleteSanctionsService.synchronizeIssfIdentities({
        championshipId,
        officialName: officialName.trim(),
        statement: auditStatement.trim(),
      });
      if (!response.success) throw new Error(response.error.message);
      setWorkspace(response.data.workspace);
      return `${response.data.identitiesCreated} identity record(s) created; ${response.data.participantsLinked} event entry link(s) added.`;
    });
  };

  const activeSanctionCount = workspace?.activeSanctions.length ?? 0;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-vscode-text">
            <ShieldAlert size={16} aria-hidden="true" /> Championship athlete identity and sanctions
          </h2>
          <p className="mt-1 text-xs text-vscode-text-muted">
            DSQ is projected across one event; DQB and AD-DSQ are projected across every linked event. Source scores
            remain immutable.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void load()}>
            <RefreshCw size={13} aria-hidden="true" /> Refresh
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setShowCreate((value) => !value)}>
            <Plus size={13} aria-hidden="true" /> Manual identity
          </Button>
        </div>
      </header>

      {error && <p className="border-l-2 border-vscode-error pl-3 text-xs text-vscode-error">{error}</p>}
      {notice && <p className="border-l-2 border-vscode-success pl-3 text-xs text-vscode-success">{notice}</p>}

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
        <Field label="Recording official">
          <input
            className={inputClass}
            value={officialName}
            onChange={(event) => setOfficialName(event.target.value)}
            placeholder="Name on the audit record"
          />
        </Field>
        <Field label="Identity-link statement">
          <input
            className={inputClass}
            value={auditStatement}
            onChange={(event) => setAuditStatement(event.target.value)}
          />
        </Field>
        <div className="flex items-end">
          <Button
            size="sm"
            disabled={busy || !officialName.trim() || !auditStatement.trim()}
            onClick={() => void synchronize()}
          >
            <Link2 size={13} aria-hidden="true" /> Reconcile ISSF IDs
          </Button>
        </div>
      </div>

      <p className="text-xs text-vscode-text-muted">
        {workspace?.identities.length ?? 0} championship identity record(s) · {activeSanctionCount} active sanction(s)
        {workspace && unlinkedEntries(workspace).length > 0
          ? ` · ${unlinkedEntries(workspace).length} event entry/entries not linked`
          : ''}
      </p>

      {showCreate && workspace && (
        <CreateIdentityForm
          workspace={workspace}
          officialName={officialName}
          statement={auditStatement}
          disabled={busy}
          onCancel={() => setShowCreate(false)}
          onSaved={(next) => {
            setWorkspace(next);
            setShowCreate(false);
          }}
          run={run}
        />
      )}

      {workspace && workspace.identities.length === 0 && (
        <p className="border-y border-vscode-border py-4 text-center text-xs text-vscode-text-muted">
          No cross-event identities yet. Reconcile entries with ISSF IDs, or create a reviewed manual identity.
        </p>
      )}

      {workspace && workspace.identities.length > 0 && (
        <div className="grid gap-3 xl:grid-cols-2">
          {workspace.identities.map((identity) => (
            <IdentityCard
              key={identity.id}
              identity={identity}
              workspace={workspace}
              officialName={officialName}
              statement={auditStatement}
              busy={busy}
              onWorkspace={setWorkspace}
              onSanction={() => setSanctionIdentityId(identity.id)}
              run={run}
            />
          ))}
        </div>
      )}

      {workspace && sanctionIdentityId && (
        <SanctionForm
          identity={workspace.identities.find((identity) => identity.id === sanctionIdentityId) ?? null}
          workspace={workspace}
          defaultOfficialName={officialName}
          busy={busy}
          onCancel={() => setSanctionIdentityId(null)}
          onWorkspace={(next) => {
            setWorkspace(next);
            setSanctionIdentityId(null);
          }}
          run={run}
        />
      )}

      {workspace && workspace.activeSanctions.length > 0 && (
        <ActiveSanctions
          workspace={workspace}
          defaultOfficialName={officialName}
          busy={busy}
          onWorkspace={setWorkspace}
          run={run}
        />
      )}
    </div>
  );
}

function CreateIdentityForm({
  workspace,
  officialName,
  statement,
  disabled,
  onCancel,
  onSaved,
  run,
}: {
  workspace: AthleteSanctionWorkspaceDto;
  officialName: string;
  statement: string;
  disabled: boolean;
  onCancel: () => void;
  onSaved: (workspace: AthleteSanctionWorkspaceDto) => void;
  run: (operation: () => Promise<string | null>) => Promise<void>;
}) {
  const available = unlinkedEntries(workspace);
  const [displayName, setDisplayName] = useState('');
  const [issfId, setIssfId] = useState('');
  const [basis, setBasis] = useState<'ISSF_ID' | 'MANUAL'>('MANUAL');
  const [participantIds, setParticipantIds] = useState<string[]>([]);

  const submit = async () => {
    await run(async () => {
      const response = await athleteSanctionsService.createIdentity({
        championshipId: workspace.championshipId,
        displayName: displayName.trim(),
        ...(issfId.trim() ? { issfId: issfId.trim() } : {}),
        participantIds,
        linkBasis: basis,
        statement: statement.trim(),
        officialName: officialName.trim(),
      });
      if (!response.success) throw new Error(response.error.message);
      onSaved(response.data);
      return 'Manual championship identity created.';
    });
  };

  return (
    <section className={sectionClass}>
      <h3 className="text-[13px] font-semibold text-vscode-text">Create reviewed identity</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Field label="Display name">
          <input className={inputClass} value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        </Field>
        <Field label="ISSF ID (optional)">
          <input className={inputClass} value={issfId} onChange={(event) => setIssfId(event.target.value)} />
        </Field>
        <Field label="Link basis">
          <select
            className={inputClass}
            value={basis}
            onChange={(event) => setBasis(event.target.value as typeof basis)}
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

function IdentityCard({
  identity,
  workspace,
  officialName,
  statement,
  busy,
  onWorkspace,
  onSanction,
  run,
}: {
  identity: AthleteIdentityDto;
  workspace: AthleteSanctionWorkspaceDto;
  officialName: string;
  statement: string;
  busy: boolean;
  onWorkspace: (workspace: AthleteSanctionWorkspaceDto) => void;
  onSanction: () => void;
  run: (operation: () => Promise<string | null>) => Promise<void>;
}) {
  const links = workspace.activeLinks.filter((link) => link.athleteIdentityId === identity.id);
  const linkedEntries = links.map((link) => {
    const entry = workspace.participantEntries.find((candidate) => candidate.participantId === link.participantId);
    return {
      link,
      playerName: entry?.playerName ?? link.playerNameSnapshot,
      eventName: entry?.eventName ?? `${link.eventNameSnapshot} (archived entry)`,
    };
  });
  const available = unlinkedEntries(workspace);
  const [participantId, setParticipantId] = useState('');
  const [basis, setBasis] = useState<'ISSF_ID' | 'MANUAL'>('MANUAL');

  const link = async () => {
    await run(async () => {
      const response = await athleteSanctionsService.linkParticipant({
        athleteIdentityId: identity.id,
        participantId,
        linkBasis: basis,
        statement: statement.trim(),
        officialName: officialName.trim(),
      });
      if (!response.success) throw new Error(response.error.message);
      onWorkspace(response.data);
      setParticipantId('');
      return 'Event entry linked to the championship identity.';
    });
  };

  const unlinkEntry = async (linkId: string, label: string) => {
    if (!(await useConfirmDialogStore.getState().openConfirm(`Unlink ${label} from this identity?`))) return;
    await run(async () => {
      const response = await athleteSanctionsService.unlinkParticipant({
        linkId,
        statement: statement.trim(),
        officialName: officialName.trim(),
      });
      if (!response.success) throw new Error(response.error.message);
      onWorkspace(response.data);
      return 'Event entry link reversed. The audit history was retained.';
    });
  };

  return (
    <article className={sectionClass}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold text-vscode-text">{identity.displayName}</h3>
          <p className="text-xs text-vscode-text-muted">ISSF ID: {identity.issfId ?? 'manual identity'}</p>
        </div>
        <Button size="sm" disabled={busy || links.length === 0} onClick={onSanction}>
          <Ban size={13} aria-hidden="true" /> Record sanction
        </Button>
      </div>
      <ul className="mt-3 divide-y divide-vscode-border border-y border-vscode-border">
        {linkedEntries.map(({ link: activeLink, playerName, eventName }) => (
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
            className={inputClass}
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
            className={inputClass}
            value={basis}
            onChange={(event) => setBasis(event.target.value as typeof basis)}
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

function SanctionForm({
  identity,
  workspace,
  defaultOfficialName,
  busy,
  onCancel,
  onWorkspace,
  run,
}: {
  identity: AthleteIdentityDto | null;
  workspace: AthleteSanctionWorkspaceDto;
  defaultOfficialName: string;
  busy: boolean;
  onCancel: () => void;
  onWorkspace: (workspace: AthleteSanctionWorkspaceDto) => void;
  run: (operation: () => Promise<string | null>) => Promise<void>;
}) {
  const [code, setCode] = useState<ClassificationCode>('DSQ');
  const [sourceEventId, setSourceEventId] = useState('');
  const [dsqBasis, setDsqBasis] = useState<'JURY_MAJORITY' | 'POST_COMPETITION_CHECK'>('JURY_MAJORITY');
  const [authorityReference, setAuthorityReference] = useState('');
  const [ruleReference, setRuleReference] = useState('ISSF 6.12.6');
  const [incidentReportNumber, setIncidentReportNumber] = useState('');
  const [publicRemark, setPublicRemark] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [officialName, setOfficialName] = useState(defaultOfficialName);

  const linkedEventIds = useMemo(() => {
    if (!identity) return [];
    const participantIds = new Set(
      workspace.activeLinks.filter((link) => link.athleteIdentityId === identity.id).map((link) => link.participantId),
    );
    return [
      ...new Set(
        workspace.participantEntries
          .filter((entry) => participantIds.has(entry.participantId))
          .map((entry) => entry.eventId),
      ),
    ];
  }, [identity, workspace]);
  const selectedEventId = sourceEventId || linkedEventIds[0] || '';
  if (!identity) return null;

  const { basis, role } = sanctionAuthority(code, dsqBasis);
  const submit = async () => {
    const confirmed = await useConfirmDialogStore
      .getState()
      .openConfirm(`Record ${code} for ${identity.displayName} and apply its official scope?`);
    if (!confirmed) return;
    await run(async () => {
      const response = await athleteSanctionsService.imposeSanction({
        athleteIdentityId: identity.id,
        sourceEventId: selectedEventId,
        classificationCode: code,
        scope: code === 'DSQ' ? 'EVENT' : 'CHAMPIONSHIP',
        authorityBasis: basis,
        authorityReference: authorityReference.trim(),
        officialName: officialName.trim(),
        officialRole: role,
        ruleReference: ruleReference.trim(),
        ...(incidentReportNumber.trim() ? { incidentReportNumber: incidentReportNumber.trim() } : {}),
        publicRemark: publicRemark.trim(),
        ...(internalNote.trim() ? { internalNote: internalNote.trim() } : {}),
        decidedAt: new Date().toISOString(),
      });
      if (!response.success) throw new Error(response.error.message);
      onWorkspace(response.data);
      return `${code} recorded and result projections invalidated for fresh review.`;
    });
  };

  return (
    <section className={`${sectionClass} border-vscode-warning`}>
      <h3 className="text-[13px] font-semibold text-vscode-text">Record sanction · {identity.displayName}</h3>
      <p className="mt-1 text-xs text-vscode-warning">
        This is a manual authority attestation. The authenticated actor port can replace it without changing sanction
        policy or result projection.
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Field label="Classification">
          <select
            className={inputClass}
            value={code}
            onChange={(event) => setCode(event.target.value as ClassificationCode)}
          >
            <option value="DSQ">DSQ — all phases of selected event</option>
            <option value="DQB">DQB — entire championship</option>
            <option value="AD_DSQ">AD-DSQ — entire championship</option>
          </select>
        </Field>
        <Field label="Source event">
          <select
            className={inputClass}
            value={selectedEventId}
            onChange={(event) => setSourceEventId(event.target.value)}
          >
            {linkedEventIds.map((eventId) => (
              <option key={eventId} value={eventId}>
                {workspace.participantEntries.find((entry) => entry.eventId === eventId)?.eventName ?? eventId}
              </option>
            ))}
          </select>
        </Field>
        {code === 'DSQ' && (
          <Field label="Authority basis">
            <select
              className={inputClass}
              value={dsqBasis}
              onChange={(event) => setDsqBasis(event.target.value as typeof dsqBasis)}
            >
              <option value="JURY_MAJORITY">Jury majority</option>
              <option value="POST_COMPETITION_CHECK">Post-competition equipment check</option>
            </select>
          </Field>
        )}
        <Field label="Official name">
          <input
            className={inputClass}
            value={officialName}
            onChange={(event) => setOfficialName(event.target.value)}
          />
        </Field>
        <Field label="Authority reference">
          <input
            className={inputClass}
            value={authorityReference}
            onChange={(event) => setAuthorityReference(event.target.value)}
            placeholder="Jury minutes / decision ID"
          />
        </Field>
        <Field label="Rule reference">
          <input
            className={inputClass}
            value={ruleReference}
            onChange={(event) => setRuleReference(event.target.value)}
          />
        </Field>
        <Field label="Incident report (optional)">
          <input
            className={inputClass}
            value={incidentReportNumber}
            onChange={(event) => setIncidentReportNumber(event.target.value)}
          />
        </Field>
        <label className={`${labelClass} md:col-span-2`}>
          Public result remark
          <input
            className={inputClass}
            value={publicRemark}
            onChange={(event) => setPublicRemark(event.target.value)}
          />
        </label>
        <label className={`${labelClass} md:col-span-3`}>
          Internal note (optional)
          <textarea
            className={`${inputClass} min-h-16 resize-y`}
            value={internalNote}
            onChange={(event) => setInternalNote(event.target.value)}
          />
        </label>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={
            busy ||
            !selectedEventId ||
            !officialName.trim() ||
            !authorityReference.trim() ||
            !ruleReference.trim() ||
            !publicRemark.trim()
          }
          onClick={() => void submit()}
        >
          <Ban size={13} aria-hidden="true" /> Record {code}
        </Button>
      </div>
    </section>
  );
}

function ActiveSanctions({
  workspace,
  defaultOfficialName,
  busy,
  onWorkspace,
  run,
}: {
  workspace: AthleteSanctionWorkspaceDto;
  defaultOfficialName: string;
  busy: boolean;
  onWorkspace: (workspace: AthleteSanctionWorkspaceDto) => void;
  run: (operation: () => Promise<string | null>) => Promise<void>;
}) {
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
    await run(async () => {
      const response = await athleteSanctionsService.revokeSanction({
        decisionId: target.id,
        authorityBasis: target.authorityBasis,
        authorityReference: authorityReference.trim(),
        officialName: officialName.trim(),
        officialRole: target.officialRole,
        ruleReference: ruleReference.trim(),
        reason: reason.trim(),
        decidedAt: new Date().toISOString(),
      });
      if (!response.success) throw new Error(response.error.message);
      onWorkspace(response.data);
      setTarget(null);
      setReason('');
      return 'Sanction revoked. The revocation and original decision remain in the audit history.';
    });
  };

  return (
    <section className={sectionClass}>
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
              className={inputClass}
              value={officialName}
              onChange={(event) => setOfficialName(event.target.value)}
            />
          </Field>
          <Field label="Authority reference">
            <input
              className={inputClass}
              value={authorityReference}
              onChange={(event) => setAuthorityReference(event.target.value)}
            />
          </Field>
          <Field label="Rule reference">
            <input
              className={inputClass}
              value={ruleReference}
              onChange={(event) => setRuleReference(event.target.value)}
            />
          </Field>
          <Field label="Public revocation reason">
            <input className={inputClass} value={reason} onChange={(event) => setReason(event.target.value)} />
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

function unlinkedEntries(workspace: AthleteSanctionWorkspaceDto) {
  const linked = new Set(workspace.activeLinks.map((link) => link.participantId));
  return workspace.participantEntries.filter((entry) => !linked.has(entry.participantId));
}

function sanctionAuthority(
  code: ClassificationCode,
  dsqBasis: 'JURY_MAJORITY' | 'POST_COMPETITION_CHECK',
): { basis: AuthorityBasis; role: OfficialRole } {
  if (code === 'AD_DSQ') return { basis: 'ANTI_DOPING_DECISION', role: 'ANTI_DOPING_AUTHORITY' };
  if (code === 'DQB') return { basis: 'JURY_MAJORITY', role: 'JURY_MEMBER' };
  return dsqBasis === 'POST_COMPETITION_CHECK'
    ? { basis: dsqBasis, role: 'EQUIPMENT_CONTROL_JURY' }
    : { basis: dsqBasis, role: 'JURY_MEMBER' };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className={labelClass}>
      {label}
      {children}
    </label>
  );
}

const sectionClass = 'rounded-[3px] border border-vscode-border bg-vscode-bg p-3';
const labelClass = 'grid gap-1 text-xs font-medium text-vscode-text-muted';
const inputClass =
  'min-h-8 w-full rounded-[2px] border border-vscode-input-border bg-vscode-input-bg px-2 py-1 text-xs text-vscode-input-text outline-none focus:border-vscode-focus';
