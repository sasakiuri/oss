import { useCallback, useEffect, useState } from 'react';
import { FileCheck2, TriangleAlert } from 'lucide-react';

import { resultPublicationService } from '@/renderer/services';
import type { FinalResultDeclarationStatusDto } from '@/shared/ipc/contracts';
import { Button } from '../../shared/common/Button';
import { Modal } from '../../shared/common/Modal';

interface FinalResultDeclarationPanelProps {
  eventId: string;
  eventName?: string;
  onClose: () => void;
}

const inputClass =
  'w-full rounded-[3px] border border-vscode-border bg-vscode-input px-2 py-1.5 text-[13px] text-vscode-text focus:border-vscode-focus focus:outline-none';

export function FinalResultDeclarationPanel({ eventId, eventName, onClose }: FinalResultDeclarationPanelProps) {
  const [status, setStatus] = useState<FinalResultDeclarationStatusDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [officialName, setOfficialName] = useState('');
  const [statement, setStatement] = useState('RESULTS ARE FINAL');
  const [finalProtestsResolved, setFinalProtestsResolved] = useState(false);
  const [resultProcessConfirmed, setResultProcessConfirmed] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await resultPublicationService.getFinalDeclarationStatus({ eventId });
      if (!response.success) throw new Error(response.error.message);
      setStatus(response.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load the Final declaration status');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const declare = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await resultPublicationService.declareFinal({
        eventId,
        finalProtestsResolved,
        resultProcessConfirmed,
        statement,
        officialName,
      });
      if (!response.success) throw new Error(response.error.message);
      setStatus(response.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to declare Final results');
    } finally {
      setSaving(false);
    }
  }, [eventId, finalProtestsResolved, officialName, resultProcessConfirmed, statement]);

  return (
    <Modal isOpen onClose={onClose} title={`Final result declaration${eventName ? ` — ${eventName}` : ''}`} size="md">
      <div className="space-y-4">
        {error && <div className="border-l-2 border-vscode-error pl-3 text-xs text-vscode-error">{error}</div>}
        {loading || !status ? (
          <p className="text-[13px] text-vscode-text-muted">Loading Final declaration status…</p>
        ) : status.declaration ? (
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-vscode-success">
              <FileCheck2 size={17} aria-hidden="true" />
              <span className="text-[13px] font-semibold">RESULTS ARE FINAL</span>
            </div>
            <dl className="grid gap-2 rounded-[3px] border border-vscode-border p-3 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-vscode-text-muted">Declared by</dt>
                <dd className="text-vscode-text">{status.declaration.officialName}</dd>
              </div>
              <div>
                <dt className="text-vscode-text-muted">Declared at</dt>
                <dd className="text-vscode-text">{new Date(status.declaration.declaredAt).toLocaleString()}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-vscode-text-muted">Statement</dt>
                <dd className="text-vscode-text">{status.declaration.statement}</dd>
              </div>
            </dl>
            {!status.declarationCurrent && (
              <div className="space-y-2 border-l-2 border-vscode-warning pl-3 text-xs text-vscode-warning">
                <div className="flex gap-2">
                  <TriangleAlert size={15} className="shrink-0" aria-hidden="true" />
                  The current Final result, RTS approval, or an operational blocker no longer matches this declaration.
                  Follow the event correction procedure; the declaration journal is unchanged.
                </div>
                {status.issues.length > 0 && (
                  <ul className="list-disc space-y-1 pl-7 text-vscode-text-muted">
                    {status.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        ) : (
          <>
            {status.issues.length > 0 && (
              <section className="rounded-[3px] border border-vscode-warning/50 bg-vscode-warning/5 p-3 text-xs">
                <div className="flex items-center gap-2 font-semibold text-vscode-warning">
                  <TriangleAlert size={14} aria-hidden="true" /> Declaration blockers
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-vscode-text-muted">
                  {status.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </section>
            )}

            <label className="block text-xs text-vscode-text-muted">
              CRO / responsible official
              <input
                className={`${inputClass} mt-1`}
                value={officialName}
                onChange={(event) => setOfficialName(event.target.value)}
              />
            </label>
            <label className="block text-xs text-vscode-text-muted">
              Declaration statement
              <textarea
                className={`${inputClass} mt-1 min-h-16 resize-y`}
                value={statement}
                onChange={(event) => setStatement(event.target.value)}
              />
            </label>
            <label className="flex items-start gap-2 text-xs text-vscode-text">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={finalProtestsResolved}
                onChange={(event) => setFinalProtestsResolved(event.target.checked)}
              />
              All immediate Final protests have been decided by the Finals Protest Jury.
            </label>
            <label className="flex items-start gap-2 text-xs text-vscode-text">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={resultProcessConfirmed}
                onChange={(event) => setResultProcessConfirmed(event.target.checked)}
              />
              The RTS result process, ranks and displayed names/nations have been confirmed.
            </label>
            <div className="flex justify-end border-t border-vscode-border pt-3">
              <Button
                size="sm"
                disabled={
                  saving ||
                  !status.canDeclare ||
                  !officialName.trim() ||
                  !statement.trim() ||
                  !finalProtestsResolved ||
                  !resultProcessConfirmed
                }
                onClick={declare}
              >
                <FileCheck2 size={14} aria-hidden="true" />
                Declare RESULTS ARE FINAL
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
