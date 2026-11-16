import { useEffect, useMemo, useState } from 'react';

import type { RecordCodeDto, RecordResultBasisDto } from '@/shared/ipc/contracts';

import { Button } from '../../shared/common/Button';
import { toDateTimeLocalValue } from '../../shared/common/dateUtils';
import { inputClass, stackedLabelClass } from '../../shared/common/formClasses';

import { ResultsBookField } from './ResultsBookField';
import {
  type EligibleRecordResult,
  RECORD_CODES,
  RECORD_RESULT_BASES,
  recordResultKey,
  recordSubjectLabel,
  scoreX10,
} from './resultsBookPresentation';
import type { ResultsBookCommands } from './useResultsBookWorkspace';

interface RecordClaimCreateFormProps {
  eligibleRecordResults: EligibleRecordResult[] | undefined;
  busy: boolean;
  createRecordClaim: ResultsBookCommands['createRecordClaim'];
}

/** Creates a record claim for an officially published result. */
export function RecordClaimCreateForm({ eligibleRecordResults, busy, createRecordClaim }: RecordClaimCreateFormProps) {
  const [resultKey, setResultKey] = useState('');
  const [recordCode, setRecordCode] = useState<RecordCodeDto>('WR');
  const [recordResultBasis, setRecordResultBasis] = useState<RecordResultBasisDto | ''>('');
  const [benchmarkScore, setBenchmarkScore] = useState('');
  const [olympicGamesConfirmed, setOlympicGamesConfirmed] = useState(false);
  const [claimedBy, setClaimedBy] = useState('');
  const [achievedAt, setAchievedAt] = useState(toDateTimeLocalValue(new Date(), 'minutes'));

  // Default to the first eligible result whenever none is selected.
  useEffect(() => {
    if (!eligibleRecordResults) return;
    if (!resultKey && eligibleRecordResults[0]) {
      setResultKey(recordResultKey(eligibleRecordResults[0]));
    }
  }, [eligibleRecordResults, resultKey]);

  const selectedResult = useMemo(
    () => eligibleRecordResults?.find((result) => recordResultKey(result) === resultKey),
    [eligibleRecordResults, resultKey],
  );

  const createClaim = async () => {
    if (!selectedResult || !recordResultBasis) return;
    await createRecordClaim(
      {
        resultId: selectedResult.resultId,
        resultScope: selectedResult.resultScope,
        code: recordCode,
        resultBasis: recordResultBasis,
        benchmarkScoreX10: scoreX10(benchmarkScore),
        olympicGamesConfirmed,
        claimedBy: claimedBy.trim(),
        achievedAt,
      },
      () => setRecordResultBasis(''),
    );
  };

  const canCreateClaim = Boolean(
    selectedResult &&
    recordResultBasis &&
    claimedBy.trim() &&
    achievedAt &&
    benchmarkScore.trim() &&
    Number.isFinite(Number(benchmarkScore)) &&
    !busy,
  );

  return (
    <>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-8">
        <label className={`${stackedLabelClass} xl:col-span-2`}>
          Officially published result
          <select className={inputClass} value={resultKey} onChange={(event) => setResultKey(event.target.value)}>
            <option value="">Select result</option>
            {eligibleRecordResults?.map((result) => (
              <option key={recordResultKey(result)} value={recordResultKey(result)}>
                {result.eventName} · {recordSubjectLabel(result.subjectKind)} · {result.subjectName} ·{' '}
                {(result.scoreX10 / 10).toFixed(1)} · {result.entryStatus}
              </option>
            ))}
          </select>
        </label>
        <label className={`${stackedLabelClass} xl:col-span-2`}>
          ISSF record result basis
          <select
            className={inputClass}
            value={recordResultBasis}
            onChange={(event) => setRecordResultBasis(event.target.value as RecordResultBasisDto | '')}
          >
            <option value="">Select record basis</option>
            {RECORD_RESULT_BASES.map((basis) => (
              <option key={basis.value} value={basis.value}>
                {basis.label}
              </option>
            ))}
          </select>
        </label>
        <label className={stackedLabelClass}>
          Record code
          <select
            className={inputClass}
            value={recordCode}
            onChange={(event) => setRecordCode(event.target.value as RecordCodeDto)}
          >
            {RECORD_CODES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        <ResultsBookField
          label="Reference record score"
          value={benchmarkScore}
          onChange={setBenchmarkScore}
          inputMode="decimal"
        />
        <ResultsBookField label="Claimed by" value={claimedBy} onChange={setClaimedBy} />
        <label className={stackedLabelClass}>
          Achieved at
          <input
            className={inputClass}
            type="datetime-local"
            value={achievedAt}
            onChange={(event) => setAchievedAt(event.target.value)}
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-vscode-text-muted">
        Q-record codes require a Qualification / Elimination basis. Select the no-Final total only after confirming the
        complete result belongs to a recognized non-Olympic event; the Technical Delegate remains responsible for event
        and medal eligibility.
      </p>
      <label className="mt-2 flex items-center gap-2 text-xs text-vscode-text-muted">
        <input
          type="checkbox"
          checked={olympicGamesConfirmed}
          onChange={(event) => setOlympicGamesConfirmed(event.target.checked)}
        />
        Confirm this competition is the Olympic Games (required for OR codes)
      </label>
      <Button className="mt-3" size="sm" disabled={!canCreateClaim} onClick={() => void createClaim()}>
        Create record claim
      </Button>
    </>
  );
}
