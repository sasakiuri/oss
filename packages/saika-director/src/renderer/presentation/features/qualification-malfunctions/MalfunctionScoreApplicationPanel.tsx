import { useCallback, useEffect, useState } from 'react';
import { malfunctionScoreApplicationsService, qualificationMalfunctionsService } from '@/renderer/services';
import type {
  MalfunctionScoreApplicationHistoryDto,
  MalfunctionScoreApplicationPreviewDto,
  MalfunctionScoreApplicationRequestDto,
  MalfunctionScoreSheetDto,
  QualificationMalfunctionCaseDto,
} from '@/shared/ipc/contracts';
import { Button } from '../shared/common/Button';

const fieldClass = 'w-full rounded border border-vscode-border bg-vscode-input px-2 py-1 text-xs text-vscode-text';
export function MalfunctionScoreApplicationPanel({
  value,
  sheets,
  disabled,
  onChanged,
}: {
  value: QualificationMalfunctionCaseDto;
  sheets: MalfunctionScoreSheetDto[];
  disabled: boolean;
  onChanged: (value: QualificationMalfunctionCaseDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<MalfunctionScoreApplicationHistoryDto[]>([]);
  const [officialName, setOfficialName] = useState('');
  const [officialRole, setOfficialRole] = useState<'RTS_OFFICER' | 'JURY_MEMBER'>('RTS_OFFICER');
  const [statement, setStatement] = useState('');
  const [innerTens, setInnerTens] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<MalfunctionScoreApplicationPreviewDto | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sheet = sheets.filter((candidate) => candidate.input.caseId === value.id).at(-1);
  const load = useCallback(async () => {
    const response = await malfunctionScoreApplicationsService.list({ caseId: value.id });
    if (!response.success) throw new Error(response.error.message);
    setHistory(response.data);
  }, [value.id]);
  useEffect(() => {
    if (open) void load().catch((caught) => setError(message(caught)));
  }, [load, open]);

  async function perform(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    await load();
    const result = await qualificationMalfunctionsService.getById({ caseId: value.id });
    if (!result.success) throw new Error(result.error.message);
    onChanged(result.data);
    setPreview(null);
    setRequestId(crypto.randomUUID());
  }
  function request(): MalfunctionScoreApplicationRequestDto {
    if (!sheet) throw new Error('Save a confirmed calculation first');
    return {
      sheetId: sheet.id,
      officialName,
      officialRole,
      statement,
      innerTens: sheet.calculation.countedShots.map((shot, index) => {
        if (shot.scoreX10 !== 100) return false;
        const answer = innerTens[`${sheet.id}:${index}`];
        if (!answer) throw new Error('Confirm every counted ten as ordinary or inner ten');
        return answer === 'INNER';
      }),
    };
  }

  return (
    <section aria-label="Apply malfunction calculation" className="space-y-3 border-t border-vscode-border pt-3">
      <Button size="sm" variant="secondary" onClick={() => setOpen(!open)}>
        {open ? 'Hide score applications' : 'Review score applications'}
      </Button>
      {open && (
        <>
          <p className="text-xs text-vscode-text-muted">
            Apply the latest confirmed calculation to the imported Director result. Check the original series and
            inner-ten evidence. This changes the Director result; Lane scoring and firing remain separate operations.
          </p>
          {error && (
            <p role="alert" className="text-xs text-vscode-error">
              {error}
            </p>
          )}
          <fieldset
            disabled={disabled || busy}
            className="space-y-2"
            onChange={() => {
              setPreview(null);
              setRequestId(crypto.randomUUID());
            }}
          >
            <label className="block text-xs">
              Applying official
              <input
                className={fieldClass}
                value={officialName}
                onChange={(event) => setOfficialName(event.target.value)}
              />
            </label>
            <label className="block text-xs">
              Applying role
              <select
                className={fieldClass}
                value={officialRole}
                onChange={(event) => setOfficialRole(event.target.value as typeof officialRole)}
              >
                <option value="RTS_OFFICER">RTS officer</option>
                <option value="JURY_MEMBER">Jury member</option>
              </select>
            </label>
            <label className="block text-xs">
              Application or withdrawal statement
              <textarea
                className={fieldClass}
                value={statement}
                onChange={(event) => setStatement(event.target.value)}
              />
            </label>
            {value.status === 'EXECUTED' && sheet && (
              <>
                <p className="text-xs">
                  {sheet.calculation.form} v{sheet.version}: {sheet.calculation.totalX10 / 10}
                </p>
                {sheet.calculation.countedShots.map(
                  (shot, index) =>
                    shot.scoreX10 === 100 && (
                      <label key={index} className="block text-xs">
                        Counted position {index + 1}: {shot.shotId} — ten classification
                        <select
                          className={fieldClass}
                          value={innerTens[`${sheet.id}:${index}`] ?? ''}
                          onChange={(event) =>
                            setInnerTens({ ...innerTens, [`${sheet.id}:${index}`]: event.target.value })
                          }
                        >
                          <option value="">Check evidence</option>
                          <option value="ORDINARY">Ordinary ten</option>
                          <option value="INNER">Inner ten</option>
                        </select>
                      </label>
                    ),
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!officialName.trim() || !statement.trim()}
                  onClick={() =>
                    void perform(async () => {
                      setPreview(null);
                      const response = await malfunctionScoreApplicationsService.preview(request());
                      if (!response.success) throw new Error(response.error.message);
                      setPreview(response.data);
                    })
                  }
                >
                  Preview Director score change
                </Button>
              </>
            )}
          </fieldset>
          {preview && preview.caseId === value.id && (
            <div className="space-y-2 border border-vscode-border p-2 text-xs">
              <p>
                Series {preview.seriesIndex + 1}: original {preview.originalScoresX10.map((s) => s / 10).join(' + ')}
                {' → '}
                {preview.replacement.shotsX10.map((s) => s / 10).join(' + ')}
              </p>
              <p className="break-all">
                Result {preview.resultId} · calculation {preview.request.sheetId}
              </p>
              <Button
                size="sm"
                disabled={disabled || busy}
                onClick={() =>
                  void perform(async () => {
                    const response = await malfunctionScoreApplicationsService.apply({
                      id: requestId,
                      request: preview.request,
                      expectedDigest: preview.digest,
                      confirmed: true,
                    });
                    if (!response.success) throw new Error(response.error.message);
                    await refresh();
                  })
                }
              >
                Confirm evidence and apply to Director result
              </Button>
            </div>
          )}
          {history.map(({ application, withdrawal }) => (
            <div key={application.id} className="space-y-1 border border-vscode-border p-2 text-xs">
              <p>
                Series {application.seriesIndex + 1} · {withdrawal ? 'Withdrawn' : 'Applied'} ·{' '}
                {application.request.officialName}
              </p>
              <p className="break-all">{application.id}</p>
              <p>{application.request.statement}</p>
              {withdrawal ? (
                <p>
                  {withdrawal.officialName}: {withdrawal.statement}
                </p>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={disabled || busy || !officialName.trim() || !statement.trim()}
                  onClick={() =>
                    void perform(async () => {
                      const response = await malfunctionScoreApplicationsService.withdraw({
                        id: requestId,
                        applicationId: application.id,
                        officialName,
                        officialRole,
                        statement,
                      });
                      if (!response.success) throw new Error(response.error.message);
                      await refresh();
                    })
                  }
                >
                  Withdraw and reopen scoring
                </Button>
              )}
            </div>
          ))}
        </>
      )}
    </section>
  );
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
