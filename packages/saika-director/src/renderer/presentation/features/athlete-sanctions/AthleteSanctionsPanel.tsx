import { useState } from 'react';
import { Link2, Plus, RefreshCw, ShieldAlert } from 'lucide-react';

import { Button } from '../shared/common/Button';
import { InlineError } from '../shared/common/InlineError';

import { ActiveSanctions } from './ActiveSanctions';
import { unlinkedEntries } from './athleteSanctionRules';
import { CreateIdentityForm } from './CreateIdentityForm';
import { Field } from './Field';
import { IdentityCard } from './IdentityCard';
import { SanctionForm } from './SanctionForm';
import { sanctionInputClass } from './sanctionFormClasses';
import { useAthleteSanctionsWorkspace } from './useAthleteSanctionsWorkspace';

export function AthleteSanctionsPanel({ championshipId }: { championshipId: string }) {
  const { workspace, busy, error, notice, load, commands } = useAthleteSanctionsWorkspace(championshipId);
  const [officialName, setOfficialName] = useState('');
  const [auditStatement, setAuditStatement] = useState('Official entries reconciled against the ISSF ID');
  const [showCreate, setShowCreate] = useState(false);
  const [sanctionIdentityId, setSanctionIdentityId] = useState<string | null>(null);

  const synchronize = async () => {
    if (!officialName.trim() || !auditStatement.trim()) return;
    await commands.synchronize({
      championshipId,
      officialName: officialName.trim(),
      statement: auditStatement.trim(),
    });
  };

  const activeSanctionCount = workspace?.activeSanctions.length ?? 0;
  const unlinkedCount = workspace ? unlinkedEntries(workspace).length : 0;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-vscode-text">
            <ShieldAlert size={16} aria-hidden="true" /> Championship athlete identity and sanctions
          </h2>
          <p className="mt-1 text-xs text-vscode-text-muted">
            DSQ applies to one event; DQB and AD-DSQ apply to every linked event. Original scores are kept in the
            record.
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

      {error && <InlineError>{error}</InlineError>}
      {notice && <p className="border-l-2 border-vscode-success pl-3 text-xs text-vscode-success">{notice}</p>}

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
        <Field label="Recording official">
          <input
            className={sanctionInputClass}
            value={officialName}
            onChange={(event) => setOfficialName(event.target.value)}
            placeholder="Name on the audit record"
          />
        </Field>
        <Field label="Identity-link statement">
          <input
            className={sanctionInputClass}
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
        {unlinkedCount > 0 ? ` · ${unlinkedCount} event entry/entries not linked` : ''}
      </p>

      {showCreate && workspace && (
        <CreateIdentityForm
          workspace={workspace}
          officialName={officialName}
          statement={auditStatement}
          disabled={busy}
          onCancel={() => setShowCreate(false)}
          onCreated={() => setShowCreate(false)}
          commands={commands}
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
              onSanction={() => setSanctionIdentityId(identity.id)}
              commands={commands}
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
          onRecorded={() => setSanctionIdentityId(null)}
          commands={commands}
        />
      )}

      {workspace && workspace.activeSanctions.length > 0 && (
        <ActiveSanctions workspace={workspace} defaultOfficialName={officialName} busy={busy} commands={commands} />
      )}
    </div>
  );
}
