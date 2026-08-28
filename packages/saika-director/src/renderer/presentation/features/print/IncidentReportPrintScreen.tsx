import { useCallback, useEffect, useState } from 'react';

import { incidentReportsService } from '@/renderer/services';
import type { RangeIncidentReportDto } from '@/shared/ipc/contracts';
import type { BoardWindowConfig } from '@/shared/types/BoardWindowConfig';
import { IncidentReportSheet } from './components/IncidentReportSheet';

interface IncidentReportPrintScreenProps {
  config: BoardWindowConfig;
}

export function IncidentReportPrintScreen({ config }: IncidentReportPrintScreenProps) {
  const [report, setReport] = useState<RangeIncidentReportDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!config.reportId) {
      setError('No Range Incident Report was specified');
      setLoading(false);
      return;
    }
    let cancelled = false;
    void incidentReportsService
      .getById({ reportId: config.reportId })
      .then((response) => {
        if (cancelled) return;
        if (!response.success) throw new Error(response.error.message);
        setReport(response.data);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Failed to load the incident report');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [config.reportId]);

  const print = useCallback(() => window.print(), []);
  const close = useCallback(() => window.close(), []);

  if (loading) return <PrintMessage message="Loading Range Incident Report…" />;
  if (error || !report)
    return <PrintMessage message={error ?? 'Range Incident Report was not found'} onClose={close} />;

  return (
    <div className="print-container">
      <div className="print-preview-controls no-print">
        <button className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700" onClick={print}>
          Print
        </button>
        <button className="rounded bg-gray-600 px-4 py-2 text-white hover:bg-gray-700" onClick={close}>
          Close
        </button>
      </div>
      <IncidentReportSheet report={report} />
    </div>
  );
}

function PrintMessage({ message, onClose }: { message: string; onClose?: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white text-gray-600">
      <p className="text-lg">{message}</p>
      {onClose && (
        <button className="mt-4 rounded bg-gray-600 px-4 py-2 text-white hover:bg-gray-700" onClick={onClose}>
          Close
        </button>
      )}
    </div>
  );
}
