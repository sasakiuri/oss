import { useEffect, useState } from 'react';

import { mqttService } from '@/renderer/services';
import type { CompetitionStartReadinessDto } from '@/shared/ipc/contracts/mqtt.contract';

import { Button } from '../shared/common/Button';

export function CompetitionStartReadinessPanel({
  competitionId,
  phase,
}: {
  competitionId: string;
  phase: 'SIGHTING' | 'MATCH';
}) {
  const [assessment, setAssessment] = useState<CompetitionStartReadinessDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setAssessment(null);
    setError(null);
    const load = async () => {
      try {
        const response = await mqttService.getStartReadiness({ competitionId, phase });
        if (disposed) return;
        if (!response.success) throw new Error(response.error.message);
        setAssessment(response.data);
        setError(null);
      } catch (caught) {
        if (disposed) return;
        setAssessment(null);
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (!disposed) timer = setTimeout(() => void load(), 10_000);
      }
    };
    void load();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [competitionId, phase, refresh]);
  const current = assessment?.competitionId === competitionId && assessment.phase === phase ? assessment : null;
  return (
    <section aria-label="Pre-start checks" className="mt-4 space-y-2 border-t border-vscode-border pt-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Pre-start checks: {phase === 'SIGHTING' ? 'sighting' : 'match'}</h3>
        <Button size="sm" variant="secondary" onClick={() => setRefresh((value) => value + 1)}>
          Refresh checks
        </Button>
      </div>
      <p className="text-vscode-text-muted">
        Relay, EST inspection, clock and timed target settings for the joined Lanes. Firing commands check the current
        conditions again. Timed target checks apply when a target program starts.
      </p>
      {error ? (
        <p role="alert">Could not check readiness: {error}</p>
      ) : !current ? (
        <p>Checking…</p>
      ) : (
        <>
          <p className="text-vscode-text-muted">
            {current.laneIds.length} joined Lanes · Checked {new Date(current.checkedAt).toLocaleTimeString()}
          </p>
          {current.laneIds.length === 0 ? (
            <p>Join Lanes before checking their readiness.</p>
          ) : current.issues.length === 0 ? (
            <p>No outstanding configured checks.</p>
          ) : (
            <ul className="space-y-1">
              {current.issues.map((issue, index) => (
                <li key={`${issue.code}:${index}`}>
                  <strong className={issue.blocking ? 'text-vscode-error' : 'text-vscode-text-muted'}>
                    {issue.blocking ? 'Required' : 'Advisory'}:
                  </strong>{' '}
                  {issue.message}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
