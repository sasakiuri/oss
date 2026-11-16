import { sentenceCaseLabel } from '@/renderer/presentation/formatters/enumLabel';
import type {
  AppendQualificationMalfunctionEntryPayload,
  QualificationMalfunctionCaseDto,
} from '@/shared/ipc/contracts';

import { MalfunctionEntryForm } from './MalfunctionEntryForm';
import { Fact } from './MalfunctionFields';
import { MalfunctionScoreSheetPanel } from './MalfunctionScoreSheetPanel';

/** The facts and history of one case, its score calculation and the entry form. */
export function MalfunctionDetail({
  value,
  disabled,
  onAppend,
  onChanged,
}: {
  value: QualificationMalfunctionCaseDto;
  disabled: boolean;
  onAppend: (payload: AppendQualificationMalfunctionEntryPayload, onSaved: () => void) => Promise<boolean>;
  /** Shows a case the score calculation changed. */
  onChanged: (value: QualificationMalfunctionCaseDto) => void;
}) {
  const stageRule = value.policySnapshot.stages.find((candidate) => candidate.stageId === value.stageId);
  return (
    <div className="space-y-3 rounded-[3px] border border-vscode-border p-3">
      <div className="grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
        <Fact label="Status" value={sentenceCaseLabel(value.status)} />
        <Fact label="Athlete" value={`${value.startNumberSnapshot ?? '--'} · ${value.participantNameSnapshot}`} />
        <Fact label="Firing context" value={`FP ${value.laneChannelSnapshot} · relay ${value.relayNumberSnapshot}`} />
        <Fact
          label="Course context"
          value={`${sentenceCaseLabel(value.phase)} · stage ${value.stageIndex + 1} · series ${value.seriesIndex + 1}`}
        />
        <Fact label="Claim mode" value={sentenceCaseLabel(value.claimMode)} />
        <Fact label="Report source" value={sentenceCaseLabel(value.reportSource)} />
        <Fact
          label="Claim assessment"
          value={`${value.claimAssessment.allowed ? 'Available' : 'Unavailable'} · ${sentenceCaseLabel(value.claimAssessment.reason)}`}
        />
        <Fact label="Recorded shots" value={`${value.recordedShots}/${value.seriesShotLimit ?? 'unlimited'}`} />
        <Fact
          label="Treatment"
          value={stageRule ? sentenceCaseLabel(stageRule.allowableTreatment.type) : 'Sighting policy'}
        />
      </div>
      <p className="text-xs leading-5 text-vscode-text">{value.summary}</p>
      <div className="rounded-[3px] bg-vscode-bg-light p-2.5 text-[11px] leading-4 text-vscode-text-muted">
        <p>Rule source: {value.rulePackIdentity?.id ?? 'Local policy snapshot'}</p>
        <p>References: {value.policySnapshot.ruleReferences.join(', ')}</p>
        <p>Required records: {value.policySnapshot.documentation.incidentRecords.join(' / ')}</p>
        {value.sourceSignalId && <p>Lane declaration: {value.sourceSignalId}</p>}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-vscode-text">Append-only history</p>
        {value.entries.length === 0 ? (
          <p className="text-xs text-vscode-text-muted">No entries yet.</p>
        ) : (
          <ol className="space-y-2">
            {value.entries.map((entry) => (
              <li key={entry.id} className="border-l-2 border-vscode-border pl-3 text-xs">
                <div className="font-medium text-vscode-text">
                  {sentenceCaseLabel(entry.type)} · {entry.officialName} ({sentenceCaseLabel(entry.officialRole)})
                </div>
                <div className="mt-0.5 text-vscode-text-muted">{entry.statement}</div>
                {(entry.classification || entry.remedy || entry.artifactId) && (
                  <div className="mt-0.5 text-[11px] text-vscode-text-muted">
                    {[entry.classification, entry.causeCode, entry.remedy, entry.artifactId]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                )}
                {entry.ruleReference && (
                  <div className="mt-0.5 text-[11px] text-vscode-text-muted">ISSF {entry.ruleReference}</div>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      <MalfunctionScoreSheetPanel value={value} disabled={disabled} onChanged={onChanged} />

      {value.status !== 'VOID' && <MalfunctionEntryForm value={value} disabled={disabled} onAppend={onAppend} />}
    </div>
  );
}
