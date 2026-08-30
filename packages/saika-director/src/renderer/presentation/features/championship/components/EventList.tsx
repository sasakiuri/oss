import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '../../shared/common/Button';
import type { EventDto } from '@/shared/ipc/contracts/championship.contract';

const EVENT_TYPE_LABELS: Record<string, string> = {
  AR60: '10m Air Rifle 60 shots',
  AP60: '10m Air Pistol 60 shots',
  AR60_FINAL: '10m Air Rifle Final',
  AP60_FINAL: '10m Air Pistol Final',
  BR60S: 'BR60S',
  BP60: 'BP60',
  BR60S_FINAL: 'BR60S Final',
  BP60_FINAL: 'BP60 Final',
};

const ROUND_LABELS: Record<string, string> = {
  Elimination: 'Elimination',
  Qualification: 'Qualification',
  Final: 'Final',
  Individual: 'Individual',
};

interface EventListProps {
  events: EventDto[];
  selectedEventId: string | null;
  onSelect: (eventId: string) => void;
  onAdd: () => void;
  onEdit: (event: EventDto) => void;
  onDelete: (eventId: string) => void;
}

export function EventList({ events, selectedEventId, onSelect, onAdd, onEdit, onDelete }: EventListProps) {
  return (
    <div>
      <div className="flex h-10 items-center justify-between border-b border-vscode-border px-3">
        <h3 className="text-[13px] font-semibold text-vscode-text">Events</h3>
        <Button size="sm" variant="secondary" onClick={onAdd}>
          <Plus size={13} aria-hidden="true" />
          Add event
        </Button>
      </div>

      {events.length === 0 ? (
        <div className="px-3 py-5">
          <p className="text-[13px] font-medium text-vscode-text">No events</p>
          <p className="mt-1 text-xs text-vscode-text-muted">Add an event to create its entry list.</p>
        </div>
      ) : (
        <div>
          {events.map((event) => (
            <div
              key={event.id}
              className={`flex items-center border-b border-vscode-border/70 last:border-b-0 ${
                selectedEventId === event.id
                  ? 'border-l-2 border-l-vscode-primary bg-vscode-highlight text-vscode-text'
                  : 'border-l-2 border-l-transparent text-vscode-text hover:bg-vscode-hover'
              }`}
            >
              <button
                type="button"
                aria-pressed={selectedEventId === event.id}
                onClick={() => onSelect(event.id)}
                className="min-w-0 flex-1 px-3 py-2.5 text-left"
              >
                <span className="block truncate text-[13px] font-semibold">{event.name}</span>
                <span className="mt-0.5 block truncate text-xs text-vscode-text-muted">
                  {EVENT_TYPE_LABELS[event.eventType] ?? event.eventType}
                  <span aria-hidden="true"> · </span>
                  {ROUND_LABELS[event.round] ?? event.round}
                </span>
              </button>
              <div className="flex items-center">
                <button
                  type="button"
                  aria-label={`Edit ${event.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(event);
                  }}
                  className="flex h-9 w-8 items-center justify-center text-vscode-dimmed transition-colors hover:bg-white/5 hover:text-vscode-text"
                >
                  <Pencil size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${event.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(event.id);
                  }}
                  className="flex h-9 w-8 items-center justify-center text-vscode-dimmed transition-colors hover:bg-vscode-error/10 hover:text-vscode-error"
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
