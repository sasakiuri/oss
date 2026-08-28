import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileWarning, Plus, RefreshCw, TriangleAlert } from 'lucide-react';

import { boardService, incidentReportsService } from '@/renderer/services';
import type {
  AppendIncidentReportEntryPayload,
  CreateRangeIncidentReportPayload,
  IncidentReportEventStatusDto,
  ParticipantDto,
  RangeIncidentReportDto,
} from '@/shared/ipc/contracts';
import { Button } from '../../shared/common/Button';
import { IncidentReportCreateForm } from './IncidentReportCreateForm';
import { IncidentReportDetail } from './IncidentReportDetail';

interface IncidentReportsViewProps {
  eventId: string;
  eventName?: string;
  participants: readonly ParticipantDto[];
}

export function IncidentReportsView({ eventId, eventName, participants }: IncidentReportsViewProps) {
  const [status, setStatus] = useState<IncidentReportEventStatusDto | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeEventId = useRef(eventId);
  activeEventId.current = eventId;

  const loadStatus = useCallback(async () => {
    const requestedEventId = eventId;
    setLoading(true);
    setError(null);
    try {
      const response = await incidentReportsService.listByEvent({ eventId });
      if (!response.success) throw new Error(response.error.message);
      if (activeEventId.current !== requestedEventId) return;
      setStatus(response.data);
      setSelectedReportId((current) => {
        if (current && response.data.reports.some((report) => report.id === current)) return current;
        return (
          [...response.data.reports].reverse().find((report) => !report.voided)?.id ??
          response.data.reports.at(-1)?.id ??
          null
        );
      });
    } catch (caught) {
      if (activeEventId.current !== requestedEventId) return;
      setError(caught instanceof Error ? caught.message : 'Failed to load Range Incident Reports');
    } finally {
      if (activeEventId.current === requestedEventId) setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    setSelectedReportId(null);
    setShowCreate(false);
    void loadStatus();
  }, [loadStatus]);

  const selectedReport = useMemo(
    () => status?.reports.find((report) => report.id === selectedReportId) ?? null,
    [selectedReportId, status],
  );
  const participantNames = useMemo(
    () => new Map(participants.map((participant) => [participant.id, participant.playerName])),
    [participants],
  );

  const createReport = useCallback(
    async (payload: CreateRangeIncidentReportPayload) => {
      setSaving(true);
      setError(null);
      try {
        const response = await incidentReportsService.create(payload);
        if (!response.success) throw new Error(response.error.message);
        setSelectedReportId(response.data.id);
        setShowCreate(false);
        await loadStatus();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Failed to create the Range Incident Report');
      } finally {
        setSaving(false);
      }
    },
    [loadStatus],
  );

  const appendEntry = useCallback(
    async (payload: AppendIncidentReportEntryPayload): Promise<boolean> => {
      setSaving(true);
      setError(null);
      try {
        const response = await incidentReportsService.appendEntry(payload);
        if (!response.success) throw new Error(response.error.message);
        await loadStatus();
        return true;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Failed to append the incident-report entry');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [loadStatus],
  );

  const openPrint = useCallback(async (reportId: string) => {
    setError(null);
    try {
      const response = await boardService.openIncidentReportPrint({ reportId });
      if (!response.success) throw new Error(response.error.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to open the incident-report print view');
    }
  }, []);

  const activeReports = status?.reports.filter((report) => !report.voided) ?? [];
  const awaitingForwarding = activeReports.filter((report) => !report.forwarded).length;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileWarning size={17} aria-hidden="true" />
            <h2 className="text-sm font-semibold text-vscode-text">Range Incident Reports</h2>
          </div>
          <p className="mt-1 text-xs text-vscode-text-muted">
            ISSF 6.14.6 append-only Form IR ledger{eventName ? ` for ${eventName}` : ''}.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={loading} onClick={() => void loadStatus()}>
            <RefreshCw size={13} aria-hidden="true" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} aria-hidden="true" /> New incident report
          </Button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Active reports" value={activeReports.length.toString()} />
        <SummaryCard
          label="Scoring-decision coverage"
          value={`${status?.coveredDecisionCount ?? 0} / ${status?.requiredDecisionCount ?? 0}`}
        />
        <SummaryCard label="Forwarding not recorded" value={awaitingForwarding.toString()} />
      </section>

      {error && <div className="border-l-2 border-vscode-error pl-3 text-[13px] text-vscode-error">{error}</div>}
      {loading && <p className="text-[13px] text-vscode-text-muted">Loading incident reports…</p>}

      {showCreate && (
        <IncidentReportCreateForm
          eventId={eventId}
          participants={participants}
          saving={saving}
          onSubmit={createReport}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {status && status.uncoveredDecisions.length > 0 && (
        <section className="rounded-[3px] border border-vscode-warning/50 bg-vscode-warning/5 p-3">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-vscode-text">
            <TriangleAlert size={14} aria-hidden="true" /> Decisions needing an active registered IR
          </div>
          <div className="mt-2 space-y-2">
            {status.uncoveredDecisions.map((decision) => (
              <div key={decision.id} className="text-xs text-vscode-text">
                <span className="font-medium">
                  {decision.type.replaceAll('_', ' ')} ·{' '}
                  {participantNames.get(decision.participantId) ?? decision.participantId} · Relay{' '}
                  {decision.relayNumber}
                </span>
                <span className="ml-2 text-vscode-warning">{formatCoverageIssue(decision.coverageIssue)}</span>
                <span className="block text-vscode-text-muted">
                  {decision.publicRemark} · Rule {decision.ruleReference}
                  {decision.incidentReportNumber ? ` · IR ${decision.incidentReportNumber}` : ''}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {status && status.reports.length === 0 && !showCreate && (
        <div className="border-y border-vscode-border py-5">
          <p className="text-[13px] font-medium text-vscode-text">No Range Incident Reports</p>
          <p className="mt-1 text-xs text-vscode-text-muted">
            Initiate a report for irregularities, penalties, malfunctions, extra time, repeats, misses, or annulments.
          </p>
        </div>
      )}

      {status && status.reports.length > 0 && (
        <div className="grid min-h-80 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="overflow-hidden rounded-[3px] border border-vscode-border bg-vscode-bg">
            <div className="border-b border-vscode-border px-3 py-2 text-xs font-semibold text-vscode-text">
              Reports ({status.reports.length})
            </div>
            <div className="max-h-[42rem] overflow-auto">
              {[...status.reports].reverse().map((report) => (
                <ReportListButton
                  key={report.id}
                  report={report}
                  selected={report.id === selectedReportId}
                  onSelect={() => setSelectedReportId(report.id)}
                />
              ))}
            </div>
          </aside>
          <section className="min-w-0">
            {selectedReport ? (
              <IncidentReportDetail
                key={selectedReport.id}
                report={selectedReport}
                saving={saving}
                onAppendEntry={appendEntry}
                onPrint={openPrint}
              />
            ) : (
              <p className="text-xs text-vscode-text-muted">Select a report.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[3px] border border-vscode-border bg-vscode-bg p-3">
      <p className="text-xs text-vscode-text-muted">{label}</p>
      <p className="mt-1 text-base font-semibold text-vscode-text">{value}</p>
    </div>
  );
}

function ReportListButton({
  report,
  selected,
  onSelect,
}: {
  report: RangeIncidentReportDto;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`block w-full border-b border-vscode-border px-3 py-2.5 text-left last:border-b-0 ${
        selected ? 'bg-vscode-highlight' : 'hover:bg-vscode-bg-hover'
      }`}
      onClick={onSelect}
    >
      <span className="flex items-center justify-between gap-2 text-[13px] font-medium text-vscode-text">
        IR {report.serialNumber}
        <span
          className={
            report.voided ? 'text-vscode-error' : report.forwarded ? 'text-vscode-success' : 'text-vscode-warning'
          }
        >
          {report.voided ? 'Void' : report.forwarded ? 'Sent' : 'Open'}
        </span>
      </span>
      <span className="mt-0.5 block truncate text-xs text-vscode-text-muted">
        {report.athleteName ?? 'General range incident'}
      </span>
      <span className="block text-xs text-vscode-text-muted">{new Date(report.occurredAt).toLocaleString()}</span>
    </button>
  );
}

function formatCoverageIssue(issue: string): string {
  switch (issue) {
    case 'MISSING_REFERENCE':
      return 'IR number missing';
    case 'REPORT_NOT_FOUND':
      return 'Referenced IR is not registered';
    case 'REPORT_VOIDED':
      return 'Referenced IR is voided';
    default:
      return issue;
  }
}
