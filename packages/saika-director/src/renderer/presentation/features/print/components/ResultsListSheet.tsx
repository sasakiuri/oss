import type { ParticipantDto, RankedResultDto } from '@/shared/ipc/contracts';

import {
  classificationSuppressesScore,
  formatClassificationCode,
  formatResultScore,
  type ResultListClassificationCode,
  type ResultListDisplayPolicy,
} from '../policies/ResultListDisplayPolicy';

export interface ResultListCertification {
  readonly status: 'DRAFT' | 'PRELIMINARY' | 'PROTEST_PENDING' | 'PROTEST_CLOSED' | 'OFFICIAL';
  readonly postedAt: string | null;
  readonly protestEndsAt: string | null;
  readonly approvalOfficialName: string | null;
  readonly publicationCurrent: boolean;
}

interface ResultsListSheetProps {
  eventName: string;
  relayNumber?: number;
  results: RankedResultDto[];
  participants: ParticipantDto[];
  policy: ResultListDisplayPolicy;
  certification: ResultListCertification;
  rulePackId?: string | null;
}

type ResultRow = {
  key: string;
  result: RankedResultDto | null;
  participant: ParticipantDto | null;
};

export function ResultsListSheet({
  eventName,
  relayNumber,
  results,
  participants,
  policy,
  certification,
  rulePackId,
}: ResultsListSheetProps) {
  const now = new Date();
  const formattedDate = `${now.getFullYear()}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')}`;
  const participantById = new Map(participants.map((participant) => [participant.id, participant]));
  const rows: ResultRow[] = results.map((result) => ({
    key: result.id,
    result,
    participant: participantById.get(result.participantId) ?? null,
  }));
  const resultParticipantIds = new Set(results.map((result) => result.participantId));
  rows.push(
    ...participants
      .filter(
        (participant) =>
          !resultParticipantIds.has(participant.id) &&
          participant.entryStatus !== undefined &&
          participant.entryStatus !== 'COMPETING',
      )
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((participant) => ({ key: `participant:${participant.id}`, result: null, participant })),
  );
  const nocIssues = participants.filter(
    (participant) => participant.nationCode && participant.nationCode.length !== 3,
  ).length;

  return (
    <div className="results-list-sheet">
      <div className="results-list-header">
        <div className="header-title">
          <h1>{eventName}</h1>
          {relayNumber !== undefined && <h2>Relay {relayNumber}</h2>}
          <div className="text-xs">{publicationLabel(certification)}</div>
        </div>
        <div className="header-date">
          {formattedDate}
          {rulePackId && <div className="text-xs">Rule Pack: {rulePackId}</div>}
        </div>
      </div>

      {certification.protestEndsAt && certification.status !== 'OFFICIAL' && (
        <div className="mb-2 text-xs">
          Score protest time ends: {new Date(certification.protestEndsAt).toLocaleString()}
        </div>
      )}

      <table className="results-list-table">
        <thead>
          <tr>
            <th className="col-rank">Rank</th>
            <th>Start No.</th>
            <th className="col-name">Athlete</th>
            <th>NOC</th>
            <th className="col-affiliation">Affiliation</th>
            {Array.from({ length: policy.totalSeries }, (_, index) => (
              <th key={index} className="col-series">
                S{index + 1}
              </th>
            ))}
            <th className="col-total">Total</th>
            <th className="col-remarks">Remarks</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, result, participant }) => {
            const classification = resolveClassification(result, participant);
            const name = result?.playerName ?? participant?.playerName ?? '—';
            const affiliation = result?.affiliation ?? participant?.affiliation ?? '—';
            return (
              <tr key={key}>
                <td className="col-rank">
                  {classification
                    ? formatClassificationCode(classification)
                    : result && result.rank > 0
                      ? result.rank
                      : '—'}
                </td>
                <td>{participant?.startNumber ?? '—'}</td>
                <td className="col-name">{name}</td>
                <td>{participant?.nationCode ?? '—'}</td>
                <td className="col-affiliation">{affiliation}</td>
                {Array.from({ length: policy.totalSeries }, (_, index) => {
                  const score = classificationSuppressesScore(classification) ? undefined : result?.seriesScores[index];
                  return (
                    <td key={index} className="col-series">
                      {score === undefined ? '—' : formatResultScore(score, policy)}
                    </td>
                  );
                })}
                <td className="col-total">
                  {!result || classificationSuppressesScore(classification)
                    ? '—'
                    : formatResultScore(result.totalScore, policy)}
                </td>
                <td className="col-remarks">{result?.remarks.join('; ') || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-3 space-y-1 text-xs">
        {certification.postedAt && <div>Posted: {new Date(certification.postedAt).toLocaleString()}</div>}
        {certification.status === 'OFFICIAL' && (
          <div>RTS Jury verification: {certification.approvalOfficialName ?? 'Recorded electronically'}</div>
        )}
        {nocIssues > 0 && (
          <div>Data notice: {nocIssues} athlete record(s) do not contain a three-letter IOC/NOC code.</div>
        )}
        <div>Classification: RPO, MQS, OOC, DNS, DNF, DSQ, DQB, AD-DSQ.</div>
      </div>
    </div>
  );
}

function resolveClassification(
  result: RankedResultDto | null,
  participant: ParticipantDto | null,
): ResultListClassificationCode | null {
  if (result?.classificationCode) return result.classificationCode;
  const status = result ? result.entryStatus : participant?.entryStatus;
  return status && status !== 'COMPETING' ? status : null;
}

function publicationLabel(certification: ResultListCertification): string {
  switch (certification.status) {
    case 'OFFICIAL':
      return certification.publicationCurrent ? 'OFFICIAL RESULTS' : 'OFFICIAL PUBLICATION — REVIEW REQUIRED';
    case 'PRELIMINARY':
    case 'PROTEST_PENDING':
    case 'PROTEST_CLOSED':
      return 'PRELIMINARY RESULTS';
    case 'DRAFT':
      return 'WORKING COPY — NOT OFFICIAL';
  }
}
