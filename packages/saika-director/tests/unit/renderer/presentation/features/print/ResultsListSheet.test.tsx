import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ResultsListSheet } from '@/renderer/presentation/features/print/components/ResultsListSheet';
import { createResultListDisplayPolicy } from '@/renderer/presentation/features/print/policies/ResultListDisplayPolicy';
import type { ParticipantDto, RankedResultDto } from '@/shared/ipc/contracts';

function result(overrides: Partial<RankedResultDto> = {}): RankedResultDto {
  return {
    id: 'result-1',
    participantId: 'participant-1',
    rank: 1,
    playerName: 'Athlete One',
    familyName: 'One',
    affiliation: 'Club',
    relayNumber: 1,
    seriesScores: [100, 100, 100],
    baseTotalScore: 300,
    totalScore: 300,
    scoreAdjustment: 0,
    deductionTotal: 0,
    remarks: [],
    entryStatus: 'COMPETING',
    classificationCode: null,
    decisionCount: 0,
    projectionIssues: [],
    evidenceSummary: {
      expectedShots: 30,
      linkedShots: 30,
      independentDecimalShots: 0,
      innerTenClassifiedShots: 30,
      scoreConflicts: 0,
    },
    revision: 'a'.repeat(64),
    confirmedAt: '2026-08-01T00:00:00.000Z',
    status: 'confirmed',
    ...overrides,
  };
}

function participant(overrides: Partial<ParticipantDto> = {}): ParticipantDto {
  return {
    id: 'participant-1',
    playerName: 'Athlete One',
    familyName: 'One',
    affiliation: 'Club',
    logoPath: null,
    sortOrder: 0,
    startNumber: '101',
    issfId: 'ISSF-101',
    nationCode: 'JPN',
    gender: 'F',
    entryStatus: 'COMPETING',
    teamId: null,
    teamName: null,
    ...overrides,
  };
}

describe('ResultsListSheet', () => {
  it.each(['RPO', 'MQS', 'OOC'] as const)(
    'prints the projected %s entry classification together with its score',
    (entryStatus) => {
      render(
        <ResultsListSheet
          eventName="Qualification"
          results={[result({ rank: 0, entryStatus })]}
          participants={[]}
          policy={createResultListDisplayPolicy({ scoringPrecision: 0, totalSeries: 3 })}
          certification={{
            status: 'DRAFT',
            postedAt: null,
            protestEndsAt: null,
            approvalOfficialName: null,
            publicationCurrent: false,
          }}
        />,
      );
      const row = screen.getByText('Athlete One').closest('tr')!;
      expect(within(row).getByText(entryStatus)).toBeInTheDocument();
      expect(within(row).getByText('300')).toBeInTheDocument();
      expect(within(row).queryByText('0')).not.toBeInTheDocument();
    },
  );

  it('uses event precision, dynamic series columns and official metadata', () => {
    render(
      <ResultsListSheet
        eventName="Air Pistol Mixed Team Qualification"
        results={[result()]}
        participants={[participant()]}
        policy={createResultListDisplayPolicy({ scoringPrecision: 0, totalSeries: 3 })}
        certification={{
          status: 'OFFICIAL',
          postedAt: '2026-08-01T01:00:00.000Z',
          protestEndsAt: '2026-08-01T01:10:00.000Z',
          approvalOfficialName: 'RTS Jury Member',
          publicationCurrent: true,
        }}
        rulePackId="ISSF:2026:APMIX30:QUALIFICATION"
      />,
    );

    expect(screen.getByText('OFFICIAL RESULTS')).toBeInTheDocument();
    expect(screen.getByText('Start No.')).toBeInTheDocument();
    expect(screen.getByText('NOC')).toBeInTheDocument();
    expect(screen.getByText('S3')).toBeInTheDocument();
    expect(screen.queryByText('S4')).not.toBeInTheDocument();
    const row = screen.getByText('Athlete One').closest('tr');
    expect(row).not.toBeNull();
    expect(within(row!).getByText('300')).toBeInTheDocument();
    expect(within(row!).queryByText('300.0')).not.toBeInTheDocument();
    expect(within(row!).getByText('101')).toBeInTheDocument();
    expect(within(row!).getByText('JPN')).toBeInTheDocument();
    expect(screen.getByText(/RTS Jury verification: RTS Jury Member/)).toBeInTheDocument();
  });

  it('prints unranked entry statuses and the AD-DSQ spelling without a score', () => {
    render(
      <ResultsListSheet
        eventName="Qualification"
        results={[
          result({
            id: 'result-2',
            participantId: 'participant-2',
            playerName: 'Disqualified Athlete',
            classificationCode: 'AD_DSQ',
          }),
        ]}
        participants={[
          participant({ id: 'participant-2', playerName: 'Disqualified Athlete', startNumber: '102' }),
          participant({
            id: 'participant-3',
            playerName: 'Absent Athlete',
            startNumber: '103',
            entryStatus: 'DNS',
            sortOrder: 2,
          }),
        ]}
        policy={createResultListDisplayPolicy({ scoringPrecision: 1, totalSeries: 3 })}
        certification={{
          status: 'DRAFT',
          postedAt: null,
          protestEndsAt: null,
          approvalOfficialName: null,
          publicationCurrent: false,
        }}
      />,
    );

    const disqualifiedRow = screen.getByText('Disqualified Athlete').closest('tr');
    const absentRow = screen.getByText('Absent Athlete').closest('tr');
    expect(within(disqualifiedRow!).getByText('AD-DSQ')).toBeInTheDocument();
    expect(within(disqualifiedRow!).getAllByText('—')).not.toHaveLength(0);
    expect(within(disqualifiedRow!).queryByText('100.0')).not.toBeInTheDocument();
    expect(within(absentRow!).getByText('DNS')).toBeInTheDocument();
    expect(screen.getByText('WORKING COPY — NOT OFFICIAL')).toBeInTheDocument();
  });
});
