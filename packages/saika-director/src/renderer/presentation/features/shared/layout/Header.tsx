import { useChampionshipStore } from '../../../stores/domain/championship.store';
import { useLaneControl } from '../../../hooks/useLaneControl';
import { PhaseIndicator } from '../common/PhaseIndicator';
import { formatRemainingTime } from '@/shared/utils/timeFormat';
import type { LanePhase } from '@/shared/constants/competition';

export function Header() {
  const selectedChampionship = useChampionshipStore((s) => s.selectedChampionship);
  const selectedEventId = useChampionshipStore((s) => s.selectedEventId);
  const { lanes } = useLaneControl();

  const selectedEvent = selectedChampionship?.events?.find((e) => e.id === selectedEventId);

  const phaseOrder: LanePhase[] = [
    'IDLE',
    'STAGE_ENTERED',
    'SHOT_COMPLETE',
    'ACTIVE',
    'SERIES_COMPLETE',
    'SHOOTOFF',
    'FINISHED',
  ];
  const dominantPhase: LanePhase = lanes.reduce((maxPhase, lane) => {
    const currentIndex = phaseOrder.indexOf(lane.phase);
    const maxIndex = phaseOrder.indexOf(maxPhase);
    return currentIndex > maxIndex ? lane.phase : maxPhase;
  }, 'IDLE' as LanePhase);

  const activeLanes = lanes.filter((lane) => lane.phase === 'ACTIVE');
  const minRemainingTime = activeLanes.length > 0 ? Math.min(...activeLanes.map((lane) => lane.remainingTime)) : 0;

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-vscode-bg-light border-b border-vscode-border">
      <div className="flex items-center gap-4">
        <h1 className="text-base font-medium text-vscode-text">{selectedChampionship?.name || 'saika.director'}</h1>
        {selectedChampionship?.date && (
          <span className="text-base text-vscode-text-muted">{selectedChampionship.date}</span>
        )}
        {selectedChampionship?.venue && (
          <span className="text-base text-vscode-text-muted">{selectedChampionship.venue}</span>
        )}
        {selectedEvent && <span className="text-base text-vscode-accent">{selectedEvent.name}</span>}
      </div>
      <div className="flex items-center gap-4">
        <PhaseIndicator phase={dominantPhase} />
        {minRemainingTime > 0 && (
          <span
            className={`font-mono text-base ${minRemainingTime <= 60 ? 'text-vscode-error animate-pulse' : 'text-vscode-text'}`}
          >
            {formatRemainingTime(minRemainingTime)}
          </span>
        )}
      </div>
    </header>
  );
}
