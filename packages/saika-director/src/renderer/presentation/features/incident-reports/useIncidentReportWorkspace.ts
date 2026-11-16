import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAsyncAction } from '@/renderer/presentation/hooks/useAsyncAction';
import { boardService, incidentReportsService } from '@/renderer/services';
import { errorMessage, unwrap } from '@/renderer/services/serviceError';
import type {
  AppendIncidentReportEntryPayload,
  CreateRangeIncidentReportPayload,
  IncidentReportEventStatusDto,
} from '@/shared/ipc/contracts';

/**
 * Owns an event's Range Incident Report workspace: the status query, the selected report (the newest active one
 * unless the selected one is still listed), whether the creation form is open, and the commands. Responses for an
 * event that is no longer shown are ignored. A saved report or entry reloads the event; the creation and entry
 * commands share one busy flag, and every failure shows in one error.
 */
export function useIncidentReportWorkspace(eventId: string) {
  const [status, setStatus] = useState<IncidentReportEventStatusDto | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const { busy: saving, error, setError, run } = useAsyncAction();
  const activeEventId = useRef(eventId);
  activeEventId.current = eventId;

  const loadStatus = useCallback(async () => {
    const requestedEventId = eventId;
    setLoading(true);
    setError(null);
    try {
      const loaded = unwrap(await incidentReportsService.listByEvent({ eventId }));
      if (activeEventId.current !== requestedEventId) return;
      setStatus(loaded);
      setSelectedReportId((current) => {
        if (current && loaded.reports.some((report) => report.id === current)) return current;
        return [...loaded.reports].reverse().find((report) => !report.voided)?.id ?? loaded.reports.at(-1)?.id ?? null;
      });
    } catch (caught) {
      if (activeEventId.current !== requestedEventId) return;
      setError(errorMessage(caught, 'Failed to load Range Incident Reports'));
    } finally {
      if (activeEventId.current === requestedEventId) setLoading(false);
    }
  }, [eventId, setError]);

  useEffect(() => {
    setSelectedReportId(null);
    setShowCreate(false);
    void loadStatus();
  }, [loadStatus]);

  const selectedReport = useMemo(
    () => status?.reports.find((report) => report.id === selectedReportId) ?? null,
    [selectedReportId, status],
  );

  const createReport = useCallback(
    async (payload: CreateRangeIncidentReportPayload) => {
      await run(async () => {
        const created = unwrap(await incidentReportsService.create(payload));
        setSelectedReportId(created.id);
        setShowCreate(false);
        await loadStatus();
      }, 'Failed to create the Range Incident Report');
    },
    [loadStatus, run],
  );

  const appendEntry = useCallback(
    (payload: AppendIncidentReportEntryPayload): Promise<boolean> =>
      run(async () => {
        unwrap(await incidentReportsService.appendEntry(payload));
        await loadStatus();
      }, 'Failed to append the incident-report entry'),
    [loadStatus, run],
  );

  const openPrint = useCallback(
    async (reportId: string) => {
      setError(null);
      try {
        unwrap(await boardService.openIncidentReportPrint({ reportId }));
      } catch (caught) {
        setError(errorMessage(caught, 'Failed to open the incident-report print view'));
      }
    },
    [setError],
  );

  return {
    status,
    selectedReportId,
    setSelectedReportId,
    selectedReport,
    showCreate,
    setShowCreate,
    loading,
    saving,
    error,
    loadStatus,
    createReport,
    appendEntry,
    openPrint,
  };
}
