import { Download } from 'lucide-react';

import { sentenceCaseLabel } from '@/renderer/presentation/formatters/enumLabel';
import type {
  StartListApprovalPayload,
  StartListDistributionChannelDto,
  StartListFinalReleaseBasisDto,
  StartListOfficialRoleDto,
  StartListVersionDto,
} from '@/shared/ipc/contracts';

import { Button } from '../../shared/common/Button';
import { mutedLabelClass, smallInputClass } from '../../shared/common/formClasses';

import { startListCsv, startListCsvFileName } from './startListCsv';
import type { StartListCommands } from './useStartListVersions';

interface StartListVersionDetailProps {
  version: StartListVersionDto;
  busy: boolean;
  sourceDirty: boolean;
  officialRole: StartListOfficialRoleDto;
  onOfficialRoleChange: (role: StartListOfficialRoleDto) => void;
  officialName: string;
  onOfficialNameChange: (name: string) => void;
  statement: string;
  onStatementChange: (statement: string) => void;
  channels: ReadonlySet<StartListDistributionChannelDto>;
  onChannelChange: (channel: StartListDistributionChannelDto, included: boolean) => void;
  finalReleaseBasis: StartListFinalReleaseBasisDto;
  onFinalReleaseBasisChange: (basis: StartListFinalReleaseBasisDto) => void;
  commands: StartListCommands;
}

/** The selected Start List version: its rows and findings, the approval fields and the version commands. */
export function StartListVersionDetail({
  version,
  busy,
  sourceDirty,
  officialRole,
  onOfficialRoleChange,
  officialName,
  onOfficialNameChange,
  statement,
  onStatementChange,
  channels,
  onChannelChange,
  finalReleaseBasis,
  onFinalReleaseBasisChange,
  commands,
}: StartListVersionDetailProps) {
  const commonApproval = (): StartListApprovalPayload => ({
    versionId: version.id,
    officialName: officialName.trim(),
    officialRole,
    statement: statement.trim(),
  });
  const ready = Boolean(officialName.trim() && statement.trim());

  return (
    <div className="space-y-3 border-t border-vscode-border pt-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-vscode-text-muted">
        <span className="font-semibold text-vscode-text">
          {sentenceCaseLabel(version.listKind)} v{version.versionNumber}
        </span>
        <span>{version.status}</span>
        {version.isCurrent && <span className="text-vscode-accent">CURRENT DISTRIBUTED VERSION</span>}
        <span>{version.deadlineStatus}</span>
        <span>{version.stale ? 'SOURCE CHANGED' : 'source current'}</span>
        <span>{version.integrityValid ? `hash ${version.sourceHash.slice(0, 12)}` : 'INTEGRITY ERROR'}</span>
      </div>
      <p className="text-[11px] text-vscode-text-muted">
        Deadline {new Date(version.publicationDueAt).toLocaleString()} · start{' '}
        {new Date(version.scheduledStartAt).toLocaleString()} · team substitution deadline{' '}
        {new Date(version.substitutionDeadlineAt).toLocaleString()}
      </p>

      <ul className="space-y-0.5 text-xs text-vscode-text-muted">
        {version.findings.map((finding) => (
          <li
            key={finding.code}
            className={
              finding.severity === 'BLOCKING'
                ? 'text-vscode-error'
                : finding.severity === 'WARNING'
                  ? 'text-vscode-warning'
                  : ''
            }
          >
            {finding.severity} · {finding.ruleReference} · {finding.message}
          </li>
        ))}
      </ul>

      <div className="overflow-x-auto rounded border border-vscode-border">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-vscode-bg-light text-vscode-text-muted">
            <tr>
              <th className={cellClass}>Relay</th>
              <th className={cellClass}>FP</th>
              <th className={cellClass}>Bib</th>
              <th className={cellClass}>Athlete</th>
              <th className={cellClass}>Nation</th>
              <th className={cellClass}>Status</th>
            </tr>
          </thead>
          <tbody>
            {version.rows.map((row) => (
              <tr key={row.participantId} className="border-t border-vscode-border text-vscode-text">
                <td className={cellClass}>{row.relayNumber ?? '—'}</td>
                <td className={cellClass}>{row.firingPointNumber ?? '—'}</td>
                <td className={cellClass}>{row.startNumber ?? '—'}</td>
                <td className={cellClass}>{row.athleteName}</td>
                <td className={cellClass}>{(row.nationCode ?? row.affiliation) || '—'}</td>
                <td className={cellClass}>{row.entryStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <label className={mutedLabelClass}>
          Acting role
          <select
            value={officialRole}
            onChange={(event) => onOfficialRoleChange(event.target.value as StartListOfficialRoleDto)}
            className={smallInputClass}
          >
            {OFFICIAL_ROLES.map((value) => (
              <option key={value} value={value}>
                {sentenceCaseLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label className={mutedLabelClass}>
          Official name
          <input
            value={officialName}
            onChange={(event) => onOfficialNameChange(event.target.value)}
            className={smallInputClass}
          />
        </label>
        <label className={mutedLabelClass}>
          Audit statement
          <input
            value={statement}
            onChange={(event) => onStatementChange(event.target.value)}
            className={smallInputClass}
          />
        </label>
      </div>

      {(version.contentApproval || version.paperlessApproval || version.distributions.length > 0) && (
        <div className="text-xs leading-5 text-vscode-text-muted">
          {version.contentApproval && <p>Content approved by {version.contentApproval.officialName}.</p>}
          {version.paperlessApproval && <p>Paperless approved by {version.paperlessApproval.officialName}.</p>}
          {version.distributions.map((entry) => (
            <p key={entry.id}>
              Distributed {new Date(entry.recordedAt).toLocaleString()} via {entry.channels.join(', ')} by{' '}
              {entry.officialName}.
            </p>
          ))}
        </div>
      )}

      {(version.status === 'APPROVED' || version.status === 'DISTRIBUTED') && (
        <div className="space-y-2 rounded border border-vscode-border p-2">
          <div className="flex flex-wrap gap-3">
            {DISTRIBUTION_CHANNELS.map((value) => (
              <label key={value} className="flex items-center gap-1.5 text-xs text-vscode-text">
                <input
                  type="checkbox"
                  checked={channels.has(value)}
                  onChange={(event) => onChannelChange(value, event.target.checked)}
                />
                {sentenceCaseLabel(value)}
              </label>
            ))}
          </div>
          {version.listKind === 'FINAL' && (
            <label className={mutedLabelClass}>
              Final release basis · ISSF 6.8.12
              <select
                value={finalReleaseBasis}
                onChange={(event) => onFinalReleaseBasisChange(event.target.value as StartListFinalReleaseBasisDto)}
                className={smallInputClass}
              >
                <option value="PROTESTS_CLEARED">Protests affecting qualification cleared</option>
                <option value="NO_QUALIFICATION_IMPACT">Open protest cannot affect Final qualification</option>
              </select>
            </label>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!version.contentApproval && version.status === 'DRAFT' && (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || sourceDirty || !ready || version.stale || !version.integrityValid}
            onClick={() => void commands.approveContent(commonApproval())}
          >
            Approve content
          </Button>
        )}
        {version.distributionMode === 'PAPERLESS' &&
          version.contentApproval &&
          !version.paperlessApproval &&
          version.status === 'APPROVED' && (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || sourceDirty || !ready || officialRole !== 'TECHNICAL_DELEGATE' || version.stale}
              onClick={() => void commands.approvePaperless(commonApproval())}
            >
              TD approve paperless
            </Button>
          )}
        {version.contentApproval &&
          (version.distributionMode === 'PRINTED' || version.paperlessApproval) &&
          (version.status === 'APPROVED' || version.status === 'DISTRIBUTED') && (
            <Button
              size="sm"
              disabled={
                busy || sourceDirty || !ready || channels.size === 0 || version.stale || !version.integrityValid
              }
              onClick={() =>
                void commands.distribute({
                  ...commonApproval(),
                  channels: [...channels],
                  ...(version.listKind === 'FINAL' ? { finalReleaseBasis } : {}),
                })
              }
            >
              {version.status === 'DISTRIBUTED' ? 'Record redistribution' : 'Record publication & distribution'}
            </Button>
          )}
        {(version.status === 'DRAFT' || version.status === 'APPROVED') && (
          <Button
            size="sm"
            variant="danger"
            disabled={busy || !ready}
            onClick={() => void commands.voidVersion(commonApproval())}
          >
            Void version
          </Button>
        )}
        {version.status === 'DISTRIBUTED' && (
          <Button
            size="sm"
            variant="danger"
            disabled={busy || !ready}
            onClick={() => void commands.withdrawDistribution(commonApproval())}
          >
            Withdraw distribution
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={() => downloadCsv(version)}>
          <Download size={13} aria-hidden="true" /> Download CSV snapshot
        </Button>
      </div>
    </div>
  );
}

function downloadCsv(version: StartListVersionDto): void {
  const url = URL.createObjectURL(new Blob([startListCsv(version)], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = startListCsvFileName(version);
  anchor.click();
  URL.revokeObjectURL(url);
}

const OFFICIAL_ROLES: readonly StartListOfficialRoleDto[] = [
  'TECHNICAL_DELEGATE',
  'RTS_JURY',
  'RTS_OFFICER',
  'ORGANIZING_COMMITTEE',
  'OTHER',
];
const DISTRIBUTION_CHANNELS: readonly StartListDistributionChannelDto[] = [
  'PRINT',
  'EMAIL',
  'VENUE_WIFI',
  'PUBLIC_INFORMATION_STATION',
  'WEBSITE',
  'OTHER',
];
const cellClass = 'whitespace-nowrap px-2 py-1.5';
