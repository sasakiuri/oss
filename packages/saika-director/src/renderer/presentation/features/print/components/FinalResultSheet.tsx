import { FinalResultSheetHeader } from './FinalResultSheetHeader';
import { FinalResultSheetRow } from './FinalResultSheetRow';
import { FinalResultSheetShootoff } from './FinalResultSheetShootoff';

interface FinalResultSheetProps {
  championship: {
    name: string;
    date: string;
    venue: string;
  };
  event: {
    name: string;
    eventType: string;
  };
  results: FinalResultData[];
  shootoffs?: ShootoffData[];
}

export interface FinalResultData {
  rank: number;
  firingPointNumber: number;
  playerName: string;
  affiliation: string;
  stage1Shots: number[];
  stage1Total: number;
  stage2Shots: number[];
  stage2Total: number;
  totalScore: number;
  seriesScores?: number[];
  seriesShotCounts?: number[];
  scoreAdjustment?: number;
  classificationCode?: 'DSQ' | 'DQB' | 'AD_DSQ' | null;
  placementReviewRequired?: boolean;
  eliminatedAtShot?: number;
  remarks: string;
}

export interface ShootoffData {
  contestedRank: number;
  participants: Array<{
    playerName: string;
    scores: number[];
    result: 'winner' | 'loser';
  }>;
}

function calculateStage2Cumulatives(
  stage1Total: number,
  stage2Shots: number[],
  seriesScores?: number[],
  eliminatedAtShot?: number,
): (number | null)[] {
  const cumulatives: (number | null)[] = [];
  let cumulative = stage1Total;

  for (let i = 0; i < 14; i += 2) {
    const shotNumber = 11 + i + 1; // 12, 14, 16, 18, 20, 22, 24

    if (eliminatedAtShot !== undefined && shotNumber > eliminatedAtShot) {
      cumulatives.push(null);
    } else {
      cumulative += seriesScores?.[i / 2 + 2] ?? (stage2Shots[i] || 0) + (stage2Shots[i + 1] || 0);
      cumulatives.push(cumulative);
    }
  }

  return cumulatives;
}

export function FinalResultSheet({ championship, event, results, shootoffs }: FinalResultSheetProps) {
  const sortedResults = [...results].sort(compareFinalResultRows);

  return (
    <div className="final-result-sheet">
      <FinalResultSheetHeader
        championshipName={championship.name}
        eventName={event.name}
        formattedDate={championship.date}
        venue={championship.venue}
      />

      <table className="final-result-table final-result-table-multirow">
        <thead>
          <tr className="header-row-1">
            <th className="col-rank" rowSpan={2}>
              Rank
            </th>
            <th className="col-name" rowSpan={2}>
              Name
            </th>
            <th className="col-affiliation" rowSpan={2}>
              Affiliation
            </th>
            <th className="col-stage1" colSpan={2}>
              1st Stage
            </th>
            <th className="col-stage2" colSpan={7}>
              2nd Stage - Elimination
            </th>
            <th className="col-total" rowSpan={2}>
              Total
            </th>
            <th className="col-remarks" rowSpan={2}>
              Remarks
            </th>
          </tr>
          <tr className="header-row-2">
            <th className="col-stage1-sub">5</th>
            <th className="col-stage1-sub">10</th>
            {/* Stage 2: 12, 14, 16, 18, 20, 22, 24 */}
            <th className="col-stage2-cumulative">12</th>
            <th className="col-stage2-cumulative">14</th>
            <th className="col-stage2-cumulative">16</th>
            <th className="col-stage2-cumulative">18</th>
            <th className="col-stage2-cumulative">20</th>
            <th className="col-stage2-cumulative">22</th>
            <th className="col-stage2-cumulative">24</th>
          </tr>
        </thead>
        <tbody>
          {sortedResults.map((result) => {
            const stage2Cumulatives = calculateStage2Cumulatives(
              result.stage1Total,
              result.stage2Shots,
              result.seriesScores,
              result.eliminatedAtShot,
            );

            return (
              <FinalResultSheetRow
                key={result.firingPointNumber}
                result={result}
                stage2Cumulatives={stage2Cumulatives}
              />
            );
          })}
        </tbody>
      </table>

      {shootoffs && shootoffs.length > 0 && <FinalResultSheetShootoff shootoffs={shootoffs} />}

      <div className="final-result-footer">
        <div className="footer-legend">
          <span>E## = Eliminated at shot ##</span>
          <span> · * = Placement review required</span>
        </div>
      </div>
    </div>
  );
}

function compareFinalResultRows(left: FinalResultData, right: FinalResultData): number {
  const leftClassified = left.classificationCode !== undefined && left.classificationCode !== null;
  const rightClassified = right.classificationCode !== undefined && right.classificationCode !== null;
  if (leftClassified !== rightClassified) return leftClassified ? 1 : -1;
  return left.rank - right.rank || left.firingPointNumber - right.firingPointNumber;
}
