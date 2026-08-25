import type { ShootoffData } from './FinalResultSheet';
import { formatScore, formatOrdinal } from '../../shared/scoring';

interface FinalResultSheetShootoffProps {
  shootoffs: ShootoffData[];
}

export function FinalResultSheetShootoff({ shootoffs }: FinalResultSheetShootoffProps) {
  return (
    <div className="shootoff-section">
      <h3>Shootoff Results</h3>
      {shootoffs.map((shootoff, idx) => (
        <div key={idx} className="shootoff-entry">
          <div className="shootoff-header">Shootoff for {formatOrdinal(shootoff.contestedRank)} place</div>
          <div className="shootoff-participants">
            {shootoff.participants.map((participant, pIdx) => (
              <div key={pIdx} className={`shootoff-participant ${participant.result}`}>
                <span className="participant-name">{participant.playerName}</span>
                <span className="participant-scores">{participant.scores.map((s) => formatScore(s)).join(' - ')}</span>
                <span className="participant-result">{participant.result === 'winner' ? 'Winner' : ''}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
