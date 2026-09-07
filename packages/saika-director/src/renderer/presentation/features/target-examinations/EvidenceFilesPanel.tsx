import { useState } from 'react';
import { evidenceFilesService } from '@/renderer/services';
import type { EvidenceFileDto } from '@/shared/ipc/contracts';
import { Button } from '../shared/common/Button';

/** File custody is optional and has no dependency on examination decisions or scoring. */
export function EvidenceFilesPanel({
  caseId,
  evidenceId,
  canImport,
}: {
  caseId: string;
  evidenceId: string;
  canImport: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [files, setFiles] = useState<EvidenceFileDto[]>([]);
  const [importedBy, setImportedBy] = useState('');
  const [statement, setStatement] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const perform = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };
  const load = async () => {
    const response = await evidenceFilesService.list({ evidenceId });
    if (!response.success) throw new Error(response.error.message);
    setFiles(response.data);
  };
  return (
    <div className="mt-2 space-y-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => {
          setExpanded(!expanded);
          if (!expanded) void perform(load);
        }}
      >
        {expanded ? 'Hide stored files' : 'Stored evidence files'}
      </Button>
      {expanded && (
        <div className="space-y-2 border-l-2 border-vscode-border pl-3">
          {error && (
            <p role="alert" className="text-xs text-vscode-error">
              {error}
            </p>
          )}
          {files.length === 0 && !busy && (
            <p className="text-xs text-vscode-text-muted">No files stored for this item.</p>
          )}
          {files.map((file) => (
            <div key={file.id} className="space-y-1 text-xs text-vscode-text-muted">
              <p>
                {file.fileName} · {file.sizeBytes} bytes · {file.importedBy} ·{' '}
                {new Date(file.importedAt).toLocaleString()}
              </p>
              <p>{file.statement}</p>
              <code className="block break-all text-[10px]">SHA-256 {file.sha256}</code>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    const response = await evidenceFilesService.exportFile({ id: file.id });
                    if (!response.success) throw new Error(response.error.message);
                  })
                }
              >
                Save verified copy
              </Button>
            </div>
          ))}
          {canImport && (
            <div className="space-y-2">
              <label className="block text-xs text-vscode-text-muted">
                Importing official
                <input
                  className={inputClass}
                  value={importedBy}
                  onChange={(event) => setImportedBy(event.target.value)}
                />
              </label>
              <label className="block text-xs text-vscode-text-muted">
                File custody statement
                <input
                  className={inputClass}
                  value={statement}
                  onChange={(event) => setStatement(event.target.value)}
                />
              </label>
              <p className="text-[11px] text-vscode-text-muted">
                Identify the source, series, orientation and any adjacent firing point. Originals up to 32 MiB are
                copied into local storage and included in competition evidence exports.
              </p>
              <Button
                size="sm"
                disabled={busy || !importedBy.trim() || !statement.trim()}
                onClick={() =>
                  void perform(async () => {
                    const response = await evidenceFilesService.importFile({
                      id: crypto.randomUUID(),
                      caseId,
                      evidenceId,
                      importedBy,
                      statement,
                    });
                    if (!response.success) throw new Error(response.error.message);
                    await load();
                  })
                }
              >
                Choose and import original file
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
const inputClass =
  'mt-1 block w-full rounded-[3px] border border-vscode-border bg-vscode-input px-2 py-1 text-xs text-vscode-text';
