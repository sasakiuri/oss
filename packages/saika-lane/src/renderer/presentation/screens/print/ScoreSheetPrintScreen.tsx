// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useState } from 'react';

import { reportService } from '@/renderer/services/reportService';
import { PrintSettingsSchema, type ScoreSheetDto } from '@/shared/ipc/contracts';

import { ScoreSheet } from './components/ScoreSheet';

/**
 * Score sheet print screen
 *
 * Retrieves the sessionId from URL query parameters
 * and displays/prints the ScoreSheet data.
 */
export function ScoreSheetPrintScreen() {
  const [scoreSheet, setScoreSheet] = useState<ScoreSheetDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Retrieve sessionId from URL query parameters
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('sessionId');
  const autoPrint = params.get('autoPrint') === 'true';
  const pageSizeResult = PrintSettingsSchema.shape.pageSize.safeParse(params.get('pageSize'));
  const pageSize = pageSizeResult.success ? pageSizeResult.data : 'A4';
  const orientation = params.get('landscape') === 'true' ? 'landscape' : 'portrait';

  // Child canvases draw in layout effects. Wait for fonts before notifying the print owner.
  useEffect(() => {
    if (!autoPrint || loading) return;
    let cancelled = false;
    void (async () => {
      await document.fonts.ready;
      if (!cancelled) await reportService.printReady(error ? { error: error.slice(0, 2000) } : {});
    })().catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to prepare printing');
    });
    return () => {
      cancelled = true;
    };
  }, [autoPrint, loading, error]);

  useEffect(() => {
    if (!sessionId) {
      setError('Session ID is not specified');
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        const data = await reportService.getScoreSheet({ sessionId });
        setScoreSheet(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to retrieve score sheet');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [sessionId]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleClose = useCallback(() => {
    window.close();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-lg text-gray-500">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white">
        <div className="mb-4 text-lg text-red-500">{error}</div>
        <button
          onClick={handleClose}
          className="rounded bg-gray-600 px-4 py-2 text-white transition-colors hover:bg-gray-700"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="print-container">
      <style>{`@page { size: ${pageSize} ${orientation}; }`}</style>
      <div className="print-preview-controls no-print">
        <button
          onClick={handlePrint}
          className="rounded bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
        >
          Print
        </button>
        <button
          onClick={handleClose}
          className="rounded bg-gray-600 px-4 py-2 text-white transition-colors hover:bg-gray-700"
        >
          Close
        </button>
      </div>
      {scoreSheet && <ScoreSheet data={scoreSheet} />}
    </div>
  );
}
