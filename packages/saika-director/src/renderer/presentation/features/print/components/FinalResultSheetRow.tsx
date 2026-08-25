import type { FinalResultData } from './FinalResultSheet';
import { formatScore, calculateStage1Series } from '../../shared/scoring';

const MAX_SHOT_ROWS = 5;

interface FinalResultSheetRowProps {
  result: FinalResultData;
  stage2Cumulatives: (number | null)[];
}

export function FinalResultSheetRow({ result, stage2Cumulatives }: FinalResultSheetRowProps) {
  const isEliminated = result.eliminatedAtShot !== undefined;

  const { first5: stage1First5, second5: stage1Second5 } = calculateStage1Series(result.stage1Shots);

  const stage1_5shots = stage1First5.reduce((sum, s) => sum + s, 0);
  const stage1_10shots = result.stage1Total;

  const stage2ShotPairs: Array<[number | undefined, number | undefined]> = [];
  for (let i = 0; i < 14; i += 2) {
    stage2ShotPairs.push([result.stage2Shots[i], result.stage2Shots[i + 1]]);
  }

  const rows: React.JSX.Element[] = [];

  rows.push(
    <tr
      key={`${result.rank}-cumulative`}
      className={`result-row result-row-cumulative ${isEliminated ? 'eliminated' : ''}`}
    >
      <td className="col-rank" rowSpan={MAX_SHOT_ROWS + 1}>
        {result.rank}
      </td>

      <td className="col-name" rowSpan={MAX_SHOT_ROWS + 1}>
        {result.playerName}
      </td>

      <td className="col-affiliation" rowSpan={MAX_SHOT_ROWS + 1}>
        {result.affiliation}
      </td>

      <td className="col-stage1-cumulative cumulative-cell">{formatScore(stage1_5shots)}</td>

      <td className="col-stage1-cumulative cumulative-cell">{formatScore(stage1_10shots)}</td>

      {stage2Cumulatives.map((cumulative, idx) => {
        const shotNumber = 12 + idx * 2;
        const isAfterElimination =
          isEliminated && result.eliminatedAtShot !== undefined && shotNumber > result.eliminatedAtShot;

        return (
          <td
            key={idx}
            className={`col-stage2-cumulative cumulative-cell ${isAfterElimination ? 'after-elimination' : ''}`}
          >
            {cumulative !== null ? formatScore(cumulative) : '-'}
          </td>
        );
      })}

      <td className="col-total" rowSpan={MAX_SHOT_ROWS + 1}>
        {formatScore(result.totalScore)}
      </td>

      <td className="col-remarks" rowSpan={MAX_SHOT_ROWS + 1}>
        {result.remarks || (isEliminated ? `E${result.eliminatedAtShot}` : '')}
      </td>
    </tr>,
  );

  for (let shotRow = 0; shotRow < MAX_SHOT_ROWS; shotRow++) {
    const stage1Shot1 = stage1First5[shotRow];
    const stage1Shot2 = stage1Second5[shotRow];

    rows.push(
      <tr
        key={`${result.rank}-shot-${shotRow}`}
        className={`result-row result-row-shot ${isEliminated ? 'eliminated' : ''}`}
      >
        <td className="col-stage1-shot shot-cell">{formatScore(stage1Shot1)}</td>

        <td className="col-stage1-shot shot-cell">{formatScore(stage1Shot2)}</td>

        {stage2ShotPairs.map((pair, pairIdx) => {
          const shotNumber = 11 + pairIdx * 2 + shotRow;
          const isAfterElimination =
            isEliminated && result.eliminatedAtShot !== undefined && shotNumber > result.eliminatedAtShot;

          if (shotRow < 2) {
            const shotValue = pair[shotRow];
            const actualShotNumber = 11 + pairIdx * 2 + shotRow;
            const isThisShotAfterElimination =
              isEliminated && result.eliminatedAtShot !== undefined && actualShotNumber > result.eliminatedAtShot;

            return (
              <td
                key={pairIdx}
                className={`col-stage2-shot shot-cell ${isThisShotAfterElimination ? 'after-elimination' : ''}`}
              >
                {isThisShotAfterElimination ? '-' : formatScore(shotValue)}
              </td>
            );
          } else {
            return (
              <td
                key={pairIdx}
                className={`col-stage2-shot shot-cell ${isAfterElimination ? 'after-elimination' : ''}`}
              >
                &nbsp;
              </td>
            );
          }
        })}
      </tr>,
    );
  }

  return <>{rows}</>;
}
