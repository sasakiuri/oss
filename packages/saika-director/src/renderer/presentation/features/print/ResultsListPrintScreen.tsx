import { useEffect, useState, useCallback } from 'react';
import type { BoardWindowConfig } from '@/shared/types/BoardWindowConfig';
import type { ParticipantDto, RankedResultDto, FinalRankedResultDto } from '@/shared/ipc/contracts';
import { ResultsListSheet, type ResultListCertification } from './components/ResultsListSheet';
import { FinalResultSheet, type FinalResultData } from './components/FinalResultSheet';
import {
  championshipService,
  resultPublicationService,
  resultVerificationService,
  resultsService,
} from '@/renderer/services';
import { createResultListDisplayPolicy, type ResultListDisplayPolicy } from './policies/ResultListDisplayPolicy';

interface Props {
  config: BoardWindowConfig;
}

function toFinalResultData(results: FinalRankedResultDto[]): FinalResultData[] {
  return results.map((r) => ({
    rank: r.rank,
    firingPointNumber: r.firingPointNumber,
    playerName: r.playerName,
    affiliation: r.affiliation,
    stage1Shots: r.stage1Shots,
    stage1Total: r.stage1Total,
    stage2Shots: r.stage2Shots,
    stage2Total: r.stage2Total,
    seriesScores: r.seriesScores,
    seriesShotCounts: r.seriesShotCounts,
    totalScore: r.totalScore,
    scoreAdjustment: r.scoreAdjustment,
    classificationCode: r.classificationCode,
    placementReviewRequired: r.placementReviewRequired,
    eliminatedAtShot: r.eliminatedAtShot,
    remarks: r.remarks,
  }));
}

export function ResultsListPrintScreen({ config }: Props) {
  const [qualificationResults, setQualificationResults] = useState<RankedResultDto[]>([]);
  const [finalResults, setFinalResults] = useState<FinalRankedResultDto[]>([]);
  const [participants, setParticipants] = useState<ParticipantDto[]>([]);
  const [displayPolicy, setDisplayPolicy] = useState<ResultListDisplayPolicy | null>(null);
  const [certification, setCertification] = useState<ResultListCertification>({
    status: 'DRAFT',
    postedAt: null,
    protestEndsAt: null,
    approvalOfficialName: null,
    publicationCurrent: false,
  });
  const [rulePackId, setRulePackId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const eventId = config.eventId;
  const eventName = config.eventName ?? 'Results List';
  const relayNumber = config.relayNumber;
  const round = config.round ?? 'Qualification';
  const eventType = config.eventType ?? '';

  const isFinal = round === 'Final';

  useEffect(() => {
    if (!eventId) {
      setError('No event was specified');
      setLoading(false);
      return;
    }

    const fetchResults = async () => {
      try {
        if (isFinal) {
          const response = await resultsService.getFinalByEvent({ eventId });
          if (!response.success) throw new Error(response.error?.message ?? 'Failed to retrieve results');
          setFinalResults(response.data.results);
        } else {
          const [
            resultsResponse,
            participantsResponse,
            assignmentsResponse,
            competitionTypesResponse,
            publicationResponse,
            verificationResponse,
          ] = await Promise.all([
            relayNumber !== undefined
              ? resultsService.getByRelay({ eventId, relayNumber })
              : resultsService.getByEvent({ eventId }),
            championshipService.getParticipants({ eventId }),
            championshipService.getFiringPointAssignments({ eventId }),
            championshipService.getCompetitionTypes(),
            resultPublicationService.getStatus({ eventId, resultScope: 'QUALIFICATION' }),
            resultVerificationService.getStatus({ eventId, resultScope: 'QUALIFICATION' }),
          ]);
          if (!resultsResponse.success) {
            throw new Error(resultsResponse.error?.message ?? 'Failed to retrieve results');
          }
          if (!participantsResponse.success) throw new Error(participantsResponse.error.message);
          if (!assignmentsResponse.success) throw new Error(assignmentsResponse.error.message);
          if (!competitionTypesResponse.success) throw new Error(competitionTypesResponse.error.message);
          if (!publicationResponse.success) throw new Error(publicationResponse.error.message);
          if (!verificationResponse.success) throw new Error(verificationResponse.error.message);
          const competitionType = competitionTypesResponse.data.types.find((type) => type.id === eventType);
          const totalSeries =
            competitionType?.totalSeries ??
            Math.max(1, ...resultsResponse.data.results.map((result) => result.seriesScores.length));
          const scoringPrecision =
            competitionType?.scoringPrecision ??
            (resultsResponse.data.results.some((result) =>
              [result.totalScore, ...result.seriesScores].some((score) => !Number.isInteger(score)),
            )
              ? 1
              : 0);
          setQualificationResults(resultsResponse.data.results);
          const relayParticipantIds =
            relayNumber === undefined
              ? null
              : new Set(
                  assignmentsResponse.data.assignments
                    .filter((assignment) => assignment.relayNumber === relayNumber)
                    .map((assignment) => assignment.participantId),
                );
          setParticipants(
            relayParticipantIds
              ? participantsResponse.data.participants.filter((participant) => relayParticipantIds.has(participant.id))
              : participantsResponse.data.participants,
          );
          setDisplayPolicy(createResultListDisplayPolicy({ scoringPrecision, totalSeries }));
          setRulePackId(competitionType?.rulePackId ?? null);
          setCertification({
            status: publicationResponse.data.status,
            postedAt: publicationResponse.data.postedAt,
            protestEndsAt: publicationResponse.data.protestEndsAt,
            approvalOfficialName: verificationResponse.data.currentApproval?.officialName ?? null,
            publicationCurrent: publicationResponse.data.publicationCurrent,
          });
        }
        setLoading(false);
      } catch (err) {
        setError((err as Error)?.message || 'Failed to retrieve results');
        setLoading(false);
      }
    };

    fetchResults();
  }, [eventId, relayNumber, isFinal, eventType]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleClose = useCallback(() => {
    window.close();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-gray-500 text-lg">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center">
        <div className="text-red-500 text-lg mb-4">{error}</div>
        <button
          onClick={handleClose}
          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
        >
          Close
        </button>
      </div>
    );
  }

  const hasResults = isFinal
    ? finalResults.length > 0
    : qualificationResults.length > 0 || participants.some((participant) => participant.entryStatus !== 'COMPETING');

  if (!hasResults) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center">
        <div className="text-gray-500 text-lg mb-4">No result data</div>
        <button
          onClick={handleClose}
          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
        >
          Close
        </button>
      </div>
    );
  }

  const formattedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="print-container">
      <div className="print-preview-controls no-print">
        <button
          onClick={handlePrint}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
        >
          Print
        </button>
        <button
          onClick={handleClose}
          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
        >
          Close
        </button>
      </div>
      {isFinal ? (
        <FinalResultSheet
          championship={{
            name: config.championshipName || '',
            date: formattedDate,
            venue: config.venue || '',
          }}
          event={{
            name: eventName,
            eventType,
          }}
          results={toFinalResultData(finalResults)}
        />
      ) : (
        displayPolicy && (
          <ResultsListSheet
            eventName={eventName}
            relayNumber={relayNumber}
            results={qualificationResults}
            participants={participants}
            policy={displayPolicy}
            certification={certification}
            rulePackId={rulePackId}
          />
        )
      )}
    </div>
  );
}
