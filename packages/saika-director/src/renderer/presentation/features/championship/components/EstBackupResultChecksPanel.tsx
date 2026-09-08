import { useState } from 'react';
import { estBackupVerificationService } from '@/renderer/services';
import type {
  EstBackupCheckPreviewDto,
  EstBackupCheckReceiptDto,
  EstBackupVerificationRunDto,
} from '@/shared/ipc/contracts';
import { Button } from '../../shared/common/Button';

/** Optional handoff: comparison, individual/team checks and result-list approval remain independent. */
export function EstBackupResultChecksPanel({ run }: { run: EstBackupVerificationRunDto }) {
  const [preview, setPreview] = useState<EstBackupCheckPreviewDto | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [source, setSource] = useState<'' | 'TARGET_PRINTOUT' | 'INDEPENDENT_MEMORY'>('');
  const [official, setOfficial] = useState(run.officialName);
  const [statement, setStatement] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<EstBackupCheckReceiptDto | null>(null);
  const load = async () => {
    const response = await estBackupVerificationService.previewChecks({ eventId: run.eventId, runId: run.id });
    if (!response.success) throw new Error(response.error.message);
    setPreview(response.data);
    setSelected(
      response.data.items
        .filter((item) => item.state === 'READY')
        .flatMap((item) => (item.resultId ? [item.resultId] : [])),
    );
    setReviewed(false);
  };
  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Result checks from EST backup" className="mt-2 space-y-2">
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => void act(load)}>
        {run.resultKind === 'MIXED_TEAM' ? 'Preview team RTS checks' : 'Preview individual RTS checks'}
      </Button>
      {error && (
        <p role="alert" className="text-vscode-error">
          {error}
        </p>
      )}
      {receipt && (
        <ul aria-label="Recorded check outcomes">
          {receipt.items.map((item) => (
            <li key={item.resultId}>
              {preview?.items.find((value) => value.resultId === item.resultId)?.name ?? item.resultId}:{' '}
              {item.state.replaceAll('_', ' ')}
              {item.issue && ` — ${item.issue}`}
            </li>
          ))}
        </ul>
      )}
      {preview && (
        <fieldset disabled={busy} className="space-y-2">
          <p>
            Review the retained source and manual interventions for each selected result. Successful entries become RTS
            checks. Approve the result list separately in Results verification.
          </p>
          <table className="w-full text-left">
            <thead>
              <tr>
                <th>Select</th>
                <th>Rank / athlete</th>
                <th>Total</th>
                <th>Interventions</th>
                <th>Check</th>
              </tr>
            </thead>
            <tbody>
              {preview.items.map((item) => (
                <tr key={item.key}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Verify ${item.name}`}
                      disabled={item.state !== 'READY'}
                      checked={!!item.resultId && selected.includes(item.resultId)}
                      onChange={(event) => {
                        const id = item.resultId!;
                        setSelected(
                          event.target.checked ? [...selected, id] : selected.filter((value) => value !== id),
                        );
                        setReviewed(false);
                      }}
                    />
                  </td>
                  <td>
                    {item.rank}. {item.name} ({item.key})
                  </td>
                  <td>{item.totalScore}</td>
                  <td>{item.interventionCount}</td>
                  <td>{item.issue ?? item.state.replaceAll('_', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <label className="block">
            Backup evidence type
            <select
              aria-label="Backup evidence type"
              className="input-base block w-full"
              value={source}
              onChange={(event) => {
                setSource(event.target.value as typeof source);
                setReviewed(false);
              }}
            >
              <option value="">Select the retained source type</option>
              <option value="TARGET_PRINTOUT">EST target printout</option>
              <option value="INDEPENDENT_MEMORY">Independent memory</option>
            </select>
          </label>
          <label className="block">
            Checking official
            <input
              aria-label="Checking official"
              className="input-base block w-full"
              value={official}
              maxLength={200}
              onChange={(event) => setOfficial(event.target.value)}
            />
          </label>
          <label className="block">
            Source and intervention review
            <textarea
              aria-label="Source and intervention review"
              className="input-base block w-full"
              value={statement}
              maxLength={1500}
              onChange={(event) => setStatement(event.target.value)}
            />
          </label>
          <label className="flex gap-2">
            <input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />I
            reviewed the backup evidence and all manual interventions for the selected results.
          </label>
          <Button
            size="sm"
            disabled={!source || !official.trim() || !statement.trim() || !reviewed || !selected.length}
            onClick={() =>
              void act(async () => {
                if (!source) return;
                const response = await estBackupVerificationService.applyChecks({
                  eventId: run.eventId,
                  runId: run.id,
                  digest: preview.digest,
                  resultIds: selected,
                  evidenceSource: source,
                  officialName: official,
                  statement,
                  manualInterventionsReviewed: true,
                });
                if (!response.success) throw new Error(response.error.message);
                setReceipt(response.data);
                await load();
              })
            }
          >
            Record selected RTS checks
          </Button>
        </fieldset>
      )}
    </section>
  );
}
