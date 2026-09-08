// SPDX-License-Identifier: MIT
import { useEffect, useRef, useState } from 'react';

import { timedTargetService } from '@/renderer/services/timedTargetService';
import {
  MAX_TIMING_MEASUREMENT_BYTES,
  type TimingMeasurementAnalysis,
  type TimingMeasurementRequest,
} from '@/shared/ipc/contracts/timingMeasurements.schema';

export interface AnalyzedTimingMeasurements {
  request: TimingMeasurementRequest;
  analysis: TimingMeasurementAnalysis;
}

/** Produces a reviewed draft; saving and activating a profile remain separate operations. */
export function TimingMeasurementImport({
  onAnalyzed,
}: {
  onAnalyzed: (value: AnalyzedTimingMeasurements | null) => void;
}) {
  const [sourceName, setSourceName] = useState('');
  const [content, setContent] = useState('');
  const [receiptMargin, setReceiptMargin] = useState('');
  const [clockMargin, setClockMargin] = useState('');
  const [analysis, setAnalysis] = useState<TimingMeasurementAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const invalidate = () => {
    setAnalysis(null);
    setError(null);
    onAnalyzed(null);
  };
  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    invalidate();
    try {
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <fieldset disabled={busy} className="space-y-2 rounded border border-zinc-700 p-2">
      <legend>Timing measurement data</legend>
      <p className="text-zinc-400">
        Import independently measured reception delays and signed clock offsets in milliseconds. Each sample must
        include measurement uncertainty. The largest absolute value plus its uncertainty and your margin is rounded up.
        This estimates bounds from the supplied samples; confirm they cover the installation's operating conditions.
        Missing sample kinds remain unknown. Analysis does not change active timing or firing windows.
      </p>
      <details>
        <summary>Measurement JSON format</summary>
        <pre className="overflow-auto text-xs">{`[
  { "kind": "RECEIPT_DELAY", "valueMilliseconds": 12.4, "uncertaintyMilliseconds": 0.6 },
  { "kind": "CLOCK_OFFSET", "valueMilliseconds": -2.1, "uncertaintyMilliseconds": 0.4 }
]`}</pre>
      </details>
      <label className="block">
        Measurement JSON file
        <input
          type="file"
          accept=".json,application/json"
          className={input}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            void act(async () => {
              if (file.size > MAX_TIMING_MEASUREMENT_BYTES)
                throw new Error('Measurement files must not exceed 256 KiB');
              const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer());
              setSourceName(file.name);
              setContent(text);
            });
          }}
        />
      </label>
      <label className="block">
        Measurement source name
        <input
          className={input}
          value={sourceName}
          maxLength={255}
          onChange={(event) => {
            invalidate();
            setSourceName(event.target.value);
          }}
        />
      </label>
      <label className="block">
        Measurement samples (JSON)
        <textarea
          className={input}
          value={content}
          maxLength={MAX_TIMING_MEASUREMENT_BYTES}
          rows={5}
          onChange={(event) => {
            invalidate();
            setContent(event.target.value);
          }}
        />
      </label>
      {(
        [
          ['Reception delay margin (ms)', receiptMargin, setReceiptMargin],
          ['Clock uncertainty margin (ms)', clockMargin, setClockMargin],
        ] as const
      ).map(([label, value, setValue]) => (
        <label className="block" key={label}>
          {label}
          <input
            className={input}
            type="number"
            min={0}
            max={60000}
            step="any"
            value={value}
            onChange={(event) => {
              invalidate();
              setValue(event.target.value);
            }}
          />
        </label>
      ))}
      <button
        type="button"
        className="rounded bg-zinc-700 px-3 py-2 disabled:opacity-50"
        disabled={!sourceName.trim() || !content.trim() || receiptMargin === '' || clockMargin === ''}
        onClick={() =>
          void act(async () => {
            const request = {
              sourceName,
              content,
              receiptMarginMilliseconds: Number(receiptMargin),
              clockMarginMilliseconds: Number(clockMargin),
            };
            const value = await timedTargetService.analyzeMeasurements(request);
            if (!mounted.current) return;
            setAnalysis(value);
            onAnalyzed({ request, analysis: value });
          })
        }
      >
        Analyze timing measurements
      </button>
      {error && (
        <p role="alert" className="text-red-400">
          {error}
        </p>
      )}
      {analysis && (
        <div role="status">
          <p>
            Reception samples: {analysis.receiptSamples}; clock samples: {analysis.clockSamples}
          </p>
          <p>
            Calculated delay: {analysis.settings.maximumReceiptDelayMilliseconds ?? 'Unknown'} ms; clock uncertainty:{' '}
            {analysis.settings.clockUncertaintyMilliseconds ?? 'Unknown'} ms
          </p>
          <p className="break-all text-xs">Source SHA-256: {analysis.sourceSha256}</p>
        </div>
      )}
    </fieldset>
  );
}
const input = 'mt-1 block w-full rounded bg-zinc-900 p-2';
