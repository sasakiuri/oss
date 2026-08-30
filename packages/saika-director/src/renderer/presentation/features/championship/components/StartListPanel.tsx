import { useCallback, useEffect, useState } from 'react';
import { Download, FileCheck2, RefreshCw } from 'lucide-react';

import { startListsService } from '@/renderer/services';
import type {
  StartListDisciplineGroupDto,
  StartListDistributionChannelDto,
  StartListDistributionModeDto,
  StartListFinalReleaseBasisDto,
  StartListKindDto,
  StartListOfficialRoleDto,
  StartListVersionDto,
} from '@/shared/ipc/contracts';

import { Button } from '../../shared/common/Button';

interface StartListPanelProps {
  eventId: string;
  round?: 'Elimination' | 'Qualification' | 'Final' | 'Individual';
  sourceDirty: boolean;
}

export function StartListPanel({ eventId, round, sourceDirty }: StartListPanelProps) {
  const [versions, setVersions] = useState<StartListVersionDto[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [listKind, setListKind] = useState<StartListKindDto>(() => kindForRound(round));
  const [disciplineGroup, setDisciplineGroup] = useState<StartListDisciplineGroupDto>('RIFLE_PISTOL');
  const [distributionMode, setDistributionMode] = useState<StartListDistributionModeDto>('PRINTED');
  const [scheduledStartAt, setScheduledStartAt] = useState(() => defaultScheduledStart());
  const [publicationDueAt, setPublicationDueAt] = useState(() => defaultPublicationDue());
  const [officialName, setOfficialName] = useState('');
  const [officialRole, setOfficialRole] = useState<StartListOfficialRoleDto>('TECHNICAL_DELEGATE');
  const [statement, setStatement] = useState('Names, Bibs, relays, firing points, and distribution details checked');
  const [channels, setChannels] = useState<Set<StartListDistributionChannelDto>>(() => new Set(['PRINT']));
  const [finalReleaseBasis, setFinalReleaseBasis] = useState<StartListFinalReleaseBasisDto>('PROTESTS_CLEARED');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = versions.find((value) => value.id === selectedId) ?? versions[0] ?? null;

  const load = useCallback(async () => {
    setError(null);
    const response = await startListsService.list({ eventId });
    if (!response.success) {
      setError(response.error.message);
      return;
    }
    setVersions(response.data);
    setSelectedId((current) =>
      response.data.some((value) => value.id === current) ? current : (response.data[0]?.id ?? ''),
    );
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (
    operation: () => Promise<{ success: boolean; data?: StartListVersionDto; error?: { message: string } }>,
  ) => {
    setBusy(true);
    setError(null);
    try {
      const response = await operation();
      if (!response.success || !response.data)
        throw new Error(response.error?.message ?? 'Start List operation failed');
      setSelectedId(response.data.id);
      await load();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  const commonApproval = () => ({
    versionId: selected!.id,
    officialName: officialName.trim(),
    officialRole,
    statement: statement.trim(),
  });
  const ready = Boolean(officialName.trim() && statement.trim());

  return (
    <section className="space-y-3 rounded border border-vscode-border bg-vscode-bg p-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 text-[13px] font-semibold text-vscode-text">
            <FileCheck2 size={15} aria-hidden="true" /> Versioned Start Lists
          </h4>
          <p className="mt-1 text-xs leading-5 text-vscode-text-muted">
            ISSF 6.6.5 · snapshot, content approval, paperless approval, and actual distribution are separate records.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => void load()} disabled={busy}>
          <RefreshCw size={13} aria-hidden="true" /> Refresh
        </Button>
      </header>

      {error && <p className="border-l-2 border-vscode-error pl-3 text-xs text-vscode-error">{error}</p>}
      {sourceDirty && (
        <p className="border-l-2 border-vscode-warning pl-3 text-xs text-vscode-warning">
          Save the firing-point grid before creating a Start List version.
        </p>
      )}

      <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        <SelectField
          label="List kind"
          value={listKind}
          onChange={(value) => setListKind(value as StartListKindDto)}
          values={LIST_KINDS}
        />
        <SelectField
          label="Discipline"
          value={disciplineGroup}
          onChange={(value) => setDisciplineGroup(value as StartListDisciplineGroupDto)}
          values={DISCIPLINE_GROUPS}
        />
        <SelectField
          label="Distribution"
          value={distributionMode}
          onChange={(value) => {
            const mode = value as StartListDistributionModeDto;
            setDistributionMode(mode);
            setChannels(new Set(mode === 'PRINTED' ? ['PRINT'] : ['EMAIL', 'PUBLIC_INFORMATION_STATION']));
          }}
          values={DISTRIBUTION_MODES}
        />
        <label className={labelClass}>
          Scheduled start
          <input
            type="datetime-local"
            value={scheduledStartAt}
            onChange={(event) => setScheduledStartAt(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Publication deadline
          <input
            type="datetime-local"
            value={publicationDueAt}
            onChange={(event) => setPublicationDueAt(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Snapshot operator
          <input
            value={officialName}
            onChange={(event) => setOfficialName(event.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={busy || sourceDirty || !officialName.trim() || !scheduledStartAt || !publicationDueAt}
          onClick={() =>
            void run(() =>
              startListsService.createVersion({
                eventId,
                listKind,
                disciplineGroup,
                distributionMode,
                scheduledStartAt: new Date(scheduledStartAt).toISOString(),
                publicationDueAt: new Date(publicationDueAt).toISOString(),
                createdBy: officialName.trim(),
              }),
            )
          }
        >
          Create snapshot version
        </Button>
        {versions.length > 0 && (
          <select
            aria-label="Stored Start List version"
            value={selected?.id ?? ''}
            onChange={(event) => setSelectedId(event.target.value)}
            className={compactSelectClass}
          >
            {versions.map((value) => (
              <option key={value.id} value={value.id}>
                {humanize(value.listKind)} v{value.versionNumber} · {value.status}
                {value.isCurrent ? ' · CURRENT' : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {selected && (
        <div className="space-y-3 border-t border-vscode-border pt-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-vscode-text-muted">
            <span className="font-semibold text-vscode-text">
              {humanize(selected.listKind)} v{selected.versionNumber}
            </span>
            <span>{selected.status}</span>
            {selected.isCurrent && <span className="text-vscode-accent">CURRENT DISTRIBUTED VERSION</span>}
            <span>{selected.deadlineStatus}</span>
            <span>{selected.stale ? 'SOURCE CHANGED' : 'source current'}</span>
            <span>{selected.integrityValid ? `hash ${selected.sourceHash.slice(0, 12)}` : 'INTEGRITY ERROR'}</span>
          </div>
          <p className="text-[11px] text-vscode-text-muted">
            Deadline {new Date(selected.publicationDueAt).toLocaleString()} · start{' '}
            {new Date(selected.scheduledStartAt).toLocaleString()} · team substitution deadline{' '}
            {new Date(selected.substitutionDeadlineAt).toLocaleString()}
          </p>

          <ul className="space-y-0.5 text-xs text-vscode-text-muted">
            {selected.findings.map((finding) => (
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
                {selected.rows.map((row) => (
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
            <label className={labelClass}>
              Acting role
              <select
                value={officialRole}
                onChange={(event) => setOfficialRole(event.target.value as StartListOfficialRoleDto)}
                className={inputClass}
              >
                {OFFICIAL_ROLES.map((value) => (
                  <option key={value} value={value}>
                    {humanize(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Official name
              <input
                value={officialName}
                onChange={(event) => setOfficialName(event.target.value)}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Audit statement
              <input value={statement} onChange={(event) => setStatement(event.target.value)} className={inputClass} />
            </label>
          </div>

          {(selected.contentApproval || selected.paperlessApproval || selected.distributions.length > 0) && (
            <div className="text-xs leading-5 text-vscode-text-muted">
              {selected.contentApproval && <p>Content approved by {selected.contentApproval.officialName}.</p>}
              {selected.paperlessApproval && <p>Paperless approved by {selected.paperlessApproval.officialName}.</p>}
              {selected.distributions.map((entry) => (
                <p key={entry.id}>
                  Distributed {new Date(entry.recordedAt).toLocaleString()} via {entry.channels.join(', ')} by{' '}
                  {entry.officialName}.
                </p>
              ))}
            </div>
          )}

          {(selected.status === 'APPROVED' || selected.status === 'DISTRIBUTED') && (
            <div className="space-y-2 rounded border border-vscode-border p-2">
              <div className="flex flex-wrap gap-3">
                {DISTRIBUTION_CHANNELS.map((value) => (
                  <label key={value} className="flex items-center gap-1.5 text-xs text-vscode-text">
                    <input
                      type="checkbox"
                      checked={channels.has(value)}
                      onChange={(event) => setChannels((current) => toggleSet(current, value, event.target.checked))}
                    />
                    {humanize(value)}
                  </label>
                ))}
              </div>
              {selected.listKind === 'FINAL' && (
                <label className={labelClass}>
                  Final release basis · ISSF 6.8.12
                  <select
                    value={finalReleaseBasis}
                    onChange={(event) => setFinalReleaseBasis(event.target.value as StartListFinalReleaseBasisDto)}
                    className={inputClass}
                  >
                    <option value="PROTESTS_CLEARED">Protests affecting qualification cleared</option>
                    <option value="NO_QUALIFICATION_IMPACT">Open protest cannot affect Final qualification</option>
                  </select>
                </label>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {!selected.contentApproval && selected.status === 'DRAFT' && (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || sourceDirty || !ready || selected.stale || !selected.integrityValid}
                onClick={() => void run(() => startListsService.approveContent(commonApproval()))}
              >
                Approve content
              </Button>
            )}
            {selected.distributionMode === 'PAPERLESS' &&
              selected.contentApproval &&
              !selected.paperlessApproval &&
              selected.status === 'APPROVED' && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy || sourceDirty || !ready || officialRole !== 'TECHNICAL_DELEGATE' || selected.stale}
                  onClick={() => void run(() => startListsService.approvePaperless(commonApproval()))}
                >
                  TD approve paperless
                </Button>
              )}
            {selected.contentApproval &&
              (selected.distributionMode === 'PRINTED' || selected.paperlessApproval) &&
              (selected.status === 'APPROVED' || selected.status === 'DISTRIBUTED') && (
                <Button
                  size="sm"
                  disabled={
                    busy || sourceDirty || !ready || channels.size === 0 || selected.stale || !selected.integrityValid
                  }
                  onClick={() =>
                    void run(() =>
                      startListsService.distribute({
                        ...commonApproval(),
                        channels: [...channels],
                        ...(selected.listKind === 'FINAL' ? { finalReleaseBasis } : {}),
                      }),
                    )
                  }
                >
                  {selected.status === 'DISTRIBUTED' ? 'Record redistribution' : 'Record publication & distribution'}
                </Button>
              )}
            {(selected.status === 'DRAFT' || selected.status === 'APPROVED') && (
              <Button
                size="sm"
                variant="danger"
                disabled={busy || !ready}
                onClick={() => void run(() => startListsService.voidVersion(commonApproval()))}
              >
                Void version
              </Button>
            )}
            {selected.status === 'DISTRIBUTED' && (
              <Button
                size="sm"
                variant="danger"
                disabled={busy || !ready}
                onClick={() => void run(() => startListsService.withdrawDistribution(commonApproval()))}
              >
                Withdraw distribution
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => downloadCsv(selected)}>
              <Download size={13} aria-hidden="true" /> Download CSV snapshot
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function SelectField({
  label,
  value,
  onChange,
  values,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  values: readonly string[];
}) {
  return (
    <label className={labelClass}>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>
        {values.map((item) => (
          <option key={item} value={item}>
            {humanize(item)}
          </option>
        ))}
      </select>
    </label>
  );
}

function downloadCsv(value: StartListVersionDto): void {
  const columns = [
    'Relay',
    'Firing point',
    'Bib',
    'ISSF ID',
    'Athlete',
    'Family name',
    'Nation',
    'Affiliation',
    'Status',
    'Team',
  ];
  const rows = value.rows.map((row) => [
    row.relayNumber ?? '',
    row.firingPointNumber ?? '',
    row.startNumber ?? '',
    row.issfId ?? '',
    row.athleteName,
    row.familyName,
    row.nationCode ?? '',
    row.affiliation,
    row.entryStatus,
    row.teamName ?? row.teamId ?? '',
  ]);
  const csv = [columns, ...rows].map((record) => record.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeFilename(value.eventNameSnapshot)}-${value.listKind.toLowerCase()}-v${value.versionNumber}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function safeFilename(value: string): string {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-|-$/g, '') || 'start-list'
  );
}

function toggleSet<T>(current: Set<T>, value: T, enabled: boolean): Set<T> {
  const next = new Set(current);
  if (enabled) next.add(value);
  else next.delete(value);
  return next;
}

function kindForRound(round: StartListPanelProps['round']): StartListKindDto {
  if (round === 'Elimination') return 'ELIMINATION';
  if (round === 'Qualification') return 'QUALIFICATION';
  if (round === 'Final') return 'FINAL';
  return 'OTHER';
}

function defaultScheduledStart(): string {
  const date = new Date(Date.now() + 24 * 60 * 60_000);
  date.setHours(10, 0, 0, 0);
  return toLocalDateTime(date);
}

function defaultPublicationDue(): string {
  const date = new Date();
  date.setHours(16, 0, 0, 0);
  return toLocalDateTime(date);
}

function toLocalDateTime(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function humanize(value: string): string {
  return value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/^./, (character) => character.toUpperCase());
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const LIST_KINDS: readonly StartListKindDto[] = [
  'PRE_EVENT_TRAINING',
  'ELIMINATION',
  'QUALIFICATION',
  'FINAL',
  'OTHER',
];
const DISCIPLINE_GROUPS: readonly StartListDisciplineGroupDto[] = ['RIFLE_PISTOL', 'SHOTGUN', 'OTHER'];
const DISTRIBUTION_MODES: readonly StartListDistributionModeDto[] = ['PRINTED', 'PAPERLESS'];
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
const labelClass = 'text-xs text-vscode-text-muted';
const inputClass =
  'mt-1 min-h-8 w-full rounded border border-vscode-border bg-vscode-input px-2 text-xs text-vscode-text';
const compactSelectClass = 'min-h-8 rounded border border-vscode-border bg-vscode-input px-2 text-xs text-vscode-text';
const cellClass = 'whitespace-nowrap px-2 py-1.5';
