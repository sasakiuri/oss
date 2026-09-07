import { useCallback, useEffect, useState } from 'react';

import { qualificationMalfunctionsService } from '@/renderer/services';
import type {
  MalfunctionScoreSheetDto,
  MalfunctionScoreSheetInputDto,
  MalfunctionScoreSheetPreviewDto,
  QualificationMalfunctionCaseDto,
} from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';
import { MalfunctionScoreApplicationPanel } from './MalfunctionScoreApplicationPanel';

type Evidence = MalfunctionScoreSheetInputDto['original'][number];
interface DraftShot {
  id: string;
  score: string;
  target: string;
  outcome: Evidence['outcome'];
}
const emptyRow = (): DraftShot[] =>
  Array.from({ length: 5 }, () => ({ id: '', score: '', target: '', outcome: 'HIT' }));
const fieldClass = 'w-full rounded border border-vscode-border bg-vscode-input px-2 py-1 text-xs text-vscode-text';

export function MalfunctionScoreSheetPanel({
  value,
  disabled,
  onChanged,
}: {
  value: QualificationMalfunctionCaseDto;
  disabled: boolean;
  onChanged: (value: QualificationMalfunctionCaseDto) => void;
}) {
  const [sheets, setSheets] = useState<MalfunctionScoreSheetDto[]>([]);
  const [original, setOriginal] = useState(emptyRow);
  const [recovery, setRecovery] = useState(emptyRow);
  const [originalSource, setOriginalSource] = useState('');
  const [recoverySource, setRecoverySource] = useState('');
  const [secondRow, setSecondRow] = useState<'' | 'ORIGINAL' | 'REPEAT'>('');
  const [secondReference, setSecondReference] = useState('');
  const [officialName, setOfficialName] = useState('');
  const [officialRole, setOfficialRole] = useState<'RTS_OFFICER' | 'JURY_MEMBER'>('RTS_OFFICER');
  const [statement, setStatement] = useState('');
  const [preview, setPreview] = useState<MalfunctionScoreSheetPreviewDto | null>(null);
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const stage = value.policySnapshot.stages.find((candidate) => candidate.stageId === value.stageId);
  const repeat = stage?.allowableTreatment.type === 'REPEAT_FULL_SERIES';
  const targetGroup =
    repeat &&
    stage.allowableTreatment.type === 'REPEAT_FULL_SERIES' &&
    stage.allowableTreatment.scoreCombination === 'LOWEST_PER_TARGET';
  const noFire =
    [...value.entries].reverse().find((entry) => entry.type === 'REMEDY_AUTHORIZED')?.remedy ===
    'SCORE_UNFIRED_AS_MISS';
  const supported = value.seriesShotLimit === 5 && value.phase === 'MATCH' && value.claimMode === 'CLAIM';
  const editable = supported && value.status === 'EXECUTED';

  const load = useCallback(async () => {
    try {
      const response = await qualificationMalfunctionsService.listScoreSheets({ caseId: value.id });
      if (!response.success) throw new Error(response.error.message);
      setSheets(response.data);
    } catch (caught) {
      setError(message(caught));
    }
  }, [value.id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function perform(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await work();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }
  const calculate = () =>
    perform(async () => {
      setPreview(null);
      const input: MalfunctionScoreSheetInputDto = {
        caseId: value.id,
        original: evidence(original, originalSource, targetGroup && !noFire),
        recovery: noFire ? [] : evidence(recovery, recoverySource, targetGroup),
        ...(secondRow && !noFire
          ? { secondMalfunction: { zeroFillRow: secondRow, evidenceReference: secondReference } }
          : {}),
        officialName,
        officialRole,
        statement,
      };
      const response = await qualificationMalfunctionsService.previewScoreSheet(input);
      if (!response.success) throw new Error(response.error.message);
      setPreview(response.data);
    });
  const save = () =>
    perform(async () => {
      if (!preview) return;
      const response = await qualificationMalfunctionsService.saveScoreSheet({
        id: draftId,
        expectedDigest: preview.digest,
        input: preview.input,
      });
      if (!response.success) throw new Error(response.error.message);
      await load();
      setPreview(null);
      setDraftId(crypto.randomUUID());
      setNotice(
        `Calculation v${response.data.version} saved. Reference ${response.data.id} after the official score application.`,
      );
      const updated = await qualificationMalfunctionsService.getById({ caseId: value.id });
      if (updated.success) onChanged(updated.data);
    });
  const exportSheet = (id: string) =>
    perform(async () => {
      const response = await qualificationMalfunctionsService.exportScoreSheet({ id });
      if (!response.success) throw new Error(response.error.message);
      if (response.data.status === 'COMPLETED') setNotice(`Calculation exported to ${response.data.path}`);
    });

  if (!supported) return null;
  return (
    <section className="space-y-3 border-t border-vscode-border pt-3" aria-label="Malfunction score calculation">
      <h3 className="text-xs font-semibold text-vscode-text">Malfunction score calculation</h3>
      <p className="text-xs text-vscode-text-muted">
        Compare confirmed original and recovery evidence, then save a versioned calculation for official score
        application. Target numbers must come from the device record or an official examination.
      </p>
      {error && (
        <p role="alert" className="text-xs text-vscode-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="break-all text-xs text-vscode-text">
          {notice}
        </p>
      )}
      {editable && (
        <fieldset
          disabled={disabled || busy}
          className="space-y-3"
          onChange={() => {
            setPreview(null);
            setDraftId(crypto.randomUUID());
          }}
        >
          <ShotRow
            title="Original"
            shots={original}
            setShots={setOriginal}
            source={originalSource}
            setSource={setOriginalSource}
            targetGroup={targetGroup && !noFire}
          />
          {!noFire && (
            <ShotRow
              title="Recovery"
              shots={recovery}
              setShots={setRecovery}
              source={recoverySource}
              setSource={setRecoverySource}
              targetGroup={targetGroup}
            />
          )}
          {repeat && !noFire && (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs">
                Second malfunction zero-fill row
                <select
                  className={fieldClass}
                  value={secondRow}
                  onChange={(event) => setSecondRow(event.target.value as typeof secondRow)}
                >
                  <option value="">No second malfunction</option>
                  <option value="ORIGINAL">Original row</option>
                  <option value="REPEAT">Repeat row</option>
                </select>
              </label>
              {secondRow && (
                <label className="text-xs">
                  Second malfunction evidence
                  <input
                    className={fieldClass}
                    value={secondReference}
                    onChange={(event) => setSecondReference(event.target.value)}
                  />
                </label>
              )}
            </div>
          )}
          <p className="text-xs text-vscode-text-muted">
            Leave unused slots blank. For a completed recovery, enter every required slot and distinguish misses, late
            shots and unfired shots. A second-malfunction comparison accepts fired shots and adds the required zeros.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs">
              Confirming official
              <input
                className={fieldClass}
                value={officialName}
                onChange={(event) => setOfficialName(event.target.value)}
              />
            </label>
            <label className="text-xs">
              Confirming role
              <select
                className={fieldClass}
                value={officialRole}
                onChange={(event) => setOfficialRole(event.target.value as typeof officialRole)}
              >
                <option value="RTS_OFFICER">RTS officer</option>
                <option value="JURY_MEMBER">Jury member</option>
              </select>
            </label>
          </div>
          <label className="block text-xs">
            Evidence confirmation statement
            <textarea className={fieldClass} value={statement} onChange={(event) => setStatement(event.target.value)} />
          </label>
          <Button
            size="sm"
            variant="secondary"
            disabled={!officialName.trim() || !statement.trim()}
            onClick={() => void calculate()}
          >
            Preview calculation
          </Button>
        </fieldset>
      )}
      {preview && (
        <div className="space-y-2 border border-vscode-border p-3">
          <p className="text-xs font-semibold">
            {preview.calculation.form}: {preview.calculation.countedShots.map((shot) => shot.scoreX10 / 10).join(' + ')}{' '}
            = {preview.calculation.totalX10 / 10}
          </p>
          <ul className="text-xs">
            {preview.calculation.countedShots.map((shot, index) => (
              <li key={index}>
                {shot.targetIndex === null ? `Position ${index + 1}` : `Target ${shot.targetIndex + 1}`}:{' '}
                {shot.scoreX10 / 10} · {shot.row} · {shot.addedZero ? 'Rule-added zero' : shot.shotId}
              </li>
            ))}
          </ul>
          <Button size="sm" disabled={disabled || busy || !editable} onClick={() => void save()}>
            Confirm and save calculation
          </Button>
        </div>
      )}
      {!editable && sheets.length === 0 && (
        <p className="text-xs text-vscode-text-muted">
          A calculation is available after authorized execution has been recorded.
        </p>
      )}
      {sheets.map((sheet) => (
        <div
          key={sheet.id}
          className="flex flex-wrap items-center justify-between gap-2 border border-vscode-border p-2 text-xs"
        >
          <div>
            <p>
              {sheet.calculation.form} v{sheet.version} · {sheet.calculation.totalX10 / 10} · {sheet.input.officialName}
            </p>
            <p className="break-all text-vscode-text-muted">{sheet.id}</p>
          </div>
          <Button size="sm" variant="secondary" disabled={busy || disabled} onClick={() => void exportSheet(sheet.id)}>
            Export printable calculation
          </Button>
        </div>
      ))}
      {sheets.length > 0 && (
        <MalfunctionScoreApplicationPanel
          key={value.id}
          value={value}
          sheets={sheets}
          disabled={disabled || busy}
          onChanged={onChanged}
        />
      )}
    </section>
  );
}

function ShotRow({
  title,
  shots,
  setShots,
  source,
  setSource,
  targetGroup,
}: {
  title: string;
  shots: DraftShot[];
  setShots: (shots: DraftShot[]) => void;
  source: string;
  setSource: (value: string) => void;
  targetGroup: boolean;
}) {
  const update = (index: number, key: keyof DraftShot, value: string) =>
    setShots(shots.map((shot, i) => (i === index ? { ...shot, [key]: value } : shot)));
  return (
    <div className="space-y-2">
      <label className="block text-xs">
        {title} evidence source
        <input
          className={fieldClass}
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder="EST record, examination or signed incident reference"
        />
      </label>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th>Shot / record ID</th>
              {targetGroup && <th>Target</th>}
              <th>Score</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {shots.map((shot, index) => (
              <tr key={index}>
                <td>
                  <input
                    aria-label={`${title} shot ${index + 1} ID`}
                    className={fieldClass}
                    value={shot.id}
                    onChange={(event) => update(index, 'id', event.target.value)}
                  />
                </td>
                {targetGroup && (
                  <td>
                    <select
                      aria-label={`${title} shot ${index + 1} target`}
                      className={fieldClass}
                      value={shot.target}
                      onChange={(event) => update(index, 'target', event.target.value)}
                    >
                      <option value="">Select</option>
                      {[1, 2, 3, 4, 5].map((target) => (
                        <option key={target} value={target}>
                          {target}
                        </option>
                      ))}
                    </select>
                  </td>
                )}
                <td>
                  <input
                    aria-label={`${title} shot ${index + 1} score`}
                    className={fieldClass}
                    type="number"
                    min="0"
                    max="10"
                    step="1"
                    value={shot.score}
                    onChange={(event) => update(index, 'score', event.target.value)}
                  />
                </td>
                <td>
                  <select
                    aria-label={`${title} shot ${index + 1} outcome`}
                    className={fieldClass}
                    value={shot.outcome}
                    onChange={(event) => update(index, 'outcome', event.target.value)}
                  >
                    <option value="HIT">Hit</option>
                    <option value="MISS">Miss</option>
                    <option value="LATE">Late</option>
                    {title === 'Recovery' && <option value="UNFIRED">Unfired</option>}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function evidence(shots: DraftShot[], source: string, targetGroup: boolean): Evidence[] {
  return shots.flatMap((shot) => {
    if (!shot.id.trim() && !shot.score.trim() && !shot.target) return [];
    if (!shot.id.trim() || !shot.score.trim())
      throw new Error('Each entered slot requires a shot or record ID and a score');
    if (targetGroup && !shot.target) throw new Error('Confirm the target number for every RFPM shot');
    return [
      {
        shotId: shot.id,
        scoreX10: Number(shot.score) * 10,
        evidenceReference: source,
        outcome: shot.outcome,
        ...(targetGroup ? { targetIndex: Number(shot.target) - 1 } : {}),
      },
    ];
  });
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
