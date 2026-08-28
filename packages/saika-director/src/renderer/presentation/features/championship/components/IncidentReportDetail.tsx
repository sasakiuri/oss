import { useState, type FormEvent } from 'react';
import { Printer } from 'lucide-react';

import type {
  AppendIncidentReportEntryPayload,
  IncidentReportOfficialRoleDto,
  RangeIncidentReportDto,
} from '@/shared/ipc/contracts';
import { Button } from '../../shared/common/Button';
import { RoleOptions } from './IncidentReportCreateForm';

interface IncidentReportDetailProps {
  report: RangeIncidentReportDto;
  saving: boolean;
  onAppendEntry: (payload: AppendIncidentReportEntryPayload) => Promise<boolean>;
  onPrint: (reportId: string) => Promise<void>;
}

type EntryAction = AppendIncidentReportEntryPayload['type'];

const inputClass =
  'w-full rounded-[3px] border border-vscode-border bg-vscode-input px-2 py-1.5 text-[13px] text-vscode-text focus:border-vscode-focus focus:outline-none';

export function IncidentReportDetail({ report, saving, onAppendEntry, onPrint }: IncidentReportDetailProps) {
  const [action, setAction] = useState<EntryAction>('SIGNATURE');
  const [officialRole, setOfficialRole] = useState<IncidentReportOfficialRoleDto>(
    report.missingSignatureRoles[0] ?? 'COMPETITION_JURY_MEMBER',
  );
  const [destination, setDestination] = useState('RTS Office / Scoring and Results Office');
  const [statement, setStatement] = useState('');
  const [officialName, setOfficialName] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const base = { reportId: report.id, officialName };
    let saved: boolean;
    switch (action) {
      case 'SIGNATURE':
        saved = await onAppendEntry({
          ...base,
          type: 'SIGNATURE',
          officialRole,
          ...(statement.trim() ? { statement } : {}),
        });
        break;
      case 'FORWARDED':
        saved = await onAppendEntry({
          ...base,
          type: 'FORWARDED',
          destination,
          ...(statement.trim() ? { statement } : {}),
        });
        break;
      case 'NOTE':
        saved = await onAppendEntry({ ...base, type: 'NOTE', statement });
        break;
      case 'VOID':
        saved = await onAppendEntry({ ...base, type: 'VOID', statement });
        break;
    }
    if (saved) setStatement('');
  };

  const statementRequired = action === 'NOTE' || action === 'VOID';

  return (
    <article className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-vscode-text">IR {report.serialNumber}</h3>
            <ReportStatus report={report} />
          </div>
          <p className="mt-1 text-xs text-vscode-text-muted">
            {report.eventName} · {new Date(report.occurredAt).toLocaleString()}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => void onPrint(report.id)}>
          <Printer size={14} aria-hidden="true" /> Print operational copy
        </Button>
      </header>

      <section className="grid gap-x-5 gap-y-3 rounded-[3px] border border-vscode-border bg-vscode-bg p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Relay" value={report.relayNumber?.toString() ?? '—'} />
        <Fact label="Firing point" value={report.firingPointNumber?.toString() ?? '—'} />
        <Fact label="Athlete" value={report.athleteName ?? '—'} />
        <Fact
          label="Bib / nationality"
          value={[report.bibNumber, report.nationality].filter(Boolean).join(' · ') || '—'}
        />
        <Fact label="Stage" value={report.stage ?? '—'} />
        <Fact label="Series" value={report.series ?? '—'} />
        <Fact label="Rules" value={report.ruleReferences} />
        <Fact label="Score amendment ref." value={report.scoreAmendmentReference ?? '—'} />
        <div className="sm:col-span-2 lg:col-span-4">
          <Fact label="Incident details" value={report.details} multiline />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <Fact label="Penalty / action" value={report.penalty ?? '—'} multiline />
        </div>
      </section>

      <section className="space-y-2">
        <h4 className="text-[13px] font-semibold text-vscode-text">Sign-off coverage</h4>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-vscode-success/50 px-2 py-1 text-vscode-success">
            {formatRole(report.initiatorRole)} · {report.initiatorName} (initiator)
          </span>
          {report.entries
            .filter((entry) => entry.type === 'SIGNATURE' && entry.officialRole)
            .map((entry) => (
              <span
                key={entry.id}
                className="rounded-full border border-vscode-success/50 px-2 py-1 text-vscode-success"
              >
                {formatRole(entry.officialRole!)} · {entry.officialName}
              </span>
            ))}
          {report.missingSignatureRoles.map((role) => (
            <span key={role} className="rounded-full border border-vscode-warning/50 px-2 py-1 text-vscode-warning">
              Missing {formatRole(role)}
            </span>
          ))}
        </div>
        <p className="text-xs text-vscode-text-muted">
          Printed names are audit attestations; they do not provide identity authentication or a cryptographic
          signature.
        </p>
      </section>

      <section className="space-y-2">
        <h4 className="text-[13px] font-semibold text-vscode-text">
          Linked scoring decisions ({report.linkedDecisions.length})
        </h4>
        {report.linkedDecisions.length === 0 ? (
          <p className="text-xs text-vscode-text-muted">No scoring decision currently references this IR serial.</p>
        ) : (
          <div className="space-y-2">
            {report.linkedDecisions.map((decision) => (
              <div key={decision.id} className="border-l-2 border-vscode-border pl-3 text-xs">
                <span className={decision.active ? 'font-semibold text-vscode-text' : 'text-vscode-text-muted'}>
                  {decision.type.replaceAll('_', ' ')} · Relay {decision.relayNumber}
                </span>
                <span className="ml-2 text-vscode-text-muted">{decision.active ? 'Active' : 'Audit history'}</span>
                <p className="mt-0.5 text-vscode-text">{decision.publicRemark}</p>
                <p className="text-vscode-text-muted">
                  Rule {decision.ruleReference} · {decision.officialName}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h4 className="text-[13px] font-semibold text-vscode-text">Append-only audit history</h4>
        {report.entries.length === 0 ? (
          <p className="text-xs text-vscode-text-muted">No entries after report initiation.</p>
        ) : (
          <div className="space-y-2">
            {report.entries.map((entry) => (
              <div key={entry.id} className="rounded-[3px] border border-vscode-border bg-vscode-bg p-3 text-xs">
                <span className="font-semibold text-vscode-text">{entry.type}</span>
                {entry.officialRole ? ` · ${formatRole(entry.officialRole)}` : ''}
                {entry.destination ? ` · ${entry.destination}` : ''}
                <p className="mt-1 text-vscode-text">{entry.statement}</p>
                <p className="mt-1 text-vscode-text-muted">
                  {entry.officialName} · {new Date(entry.recordedAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {!report.voided && (
        <form
          aria-label={`Append entry to IR ${report.serialNumber}`}
          className="space-y-3 border-t border-vscode-border pt-4"
          onSubmit={submit}
        >
          <h4 className="text-[13px] font-semibold text-vscode-text">Append audit entry</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-vscode-text-muted">
              Action
              <select
                className={`${inputClass} mt-1`}
                value={action}
                onChange={(event) => setAction(event.target.value as EntryAction)}
              >
                <option value="SIGNATURE">Add official sign-off</option>
                <option value="FORWARDED">Record copy forwarding</option>
                <option value="NOTE">Add audit note</option>
                <option value="VOID">Void report</option>
              </select>
            </label>
            {action === 'SIGNATURE' && (
              <label className="text-xs text-vscode-text-muted">
                Signing role
                <select
                  className={`${inputClass} mt-1`}
                  value={officialRole}
                  onChange={(event) => setOfficialRole(event.target.value as IncidentReportOfficialRoleDto)}
                >
                  <RoleOptions />
                </select>
              </label>
            )}
            {action === 'FORWARDED' && (
              <label className="text-xs text-vscode-text-muted">
                Destination
                <input
                  className={`${inputClass} mt-1`}
                  required
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                />
              </label>
            )}
          </div>
          <label className="block text-xs text-vscode-text-muted">
            {action === 'VOID' ? 'Void reason' : action === 'NOTE' ? 'Audit note' : 'Statement (optional)'}
            <textarea
              className={`${inputClass} mt-1 min-h-14 resize-y`}
              required={statementRequired}
              value={statement}
              onChange={(event) => setStatement(event.target.value)}
            />
          </label>
          <label className="block text-xs text-vscode-text-muted">
            Official printed name
            <input
              className={`${inputClass} mt-1`}
              required
              value={officialName}
              onChange={(event) => setOfficialName(event.target.value)}
            />
          </label>
          {action === 'VOID' && (
            <p className="text-xs text-vscode-warning">
              Voiding is permanent. The report and all existing audit entries remain available for inspection.
            </p>
          )}
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              variant={action === 'VOID' ? 'danger' : 'primary'}
              disabled={
                saving ||
                !officialName.trim() ||
                (statementRequired && !statement.trim()) ||
                (action === 'FORWARDED' && !destination.trim())
              }
            >
              {saving ? 'Saving…' : action === 'VOID' ? 'Append void entry' : 'Append entry'}
            </Button>
          </div>
        </form>
      )}
    </article>
  );
}

function ReportStatus({ report }: { report: RangeIncidentReportDto }) {
  if (report.voided) return <span className="text-xs font-medium text-vscode-error">Voided</span>;
  if (report.forwarded) return <span className="text-xs font-medium text-vscode-success">Forwarded</span>;
  return <span className="text-xs font-medium text-vscode-warning">Forwarding not recorded</span>;
}

function Fact({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div>
      <p className="text-xs text-vscode-text-muted">{label}</p>
      <p className={`mt-0.5 text-[13px] text-vscode-text ${multiline ? 'whitespace-pre-wrap' : ''}`}>{value}</p>
    </div>
  );
}

function formatRole(role: string): string {
  return role
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
