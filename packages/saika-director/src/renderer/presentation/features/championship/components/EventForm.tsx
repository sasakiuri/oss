import { useState, useEffect } from 'react';
import { Button } from '../../shared/common/Button';
import { Input } from '../../shared/common/Input';
import { championshipService } from '@/renderer/services';
import type { EventDto, CompetitionTypeDto } from '@/shared/ipc/contracts/championship.contract';
import type { EventType } from '@/shared/constants/competition';

interface EventFormProps {
  event?: EventDto;
  onSubmit: (data: { name: string; eventType: EventType }) => void;
  onCancel: () => void;
}

export function EventForm({ event, onSubmit, onCancel }: EventFormProps) {
  const [competitionTypes, setCompetitionTypes] = useState<CompetitionTypeDto[]>([]);
  const [name, setName] = useState(event?.name ?? '');
  const [eventType, setEventType] = useState<EventType>(event?.eventType ?? '');

  useEffect(() => {
    championshipService.getCompetitionTypes().then((res) => {
      if (res.success) {
        setCompetitionTypes(res.data.types);
        // Set default eventType to first available type if not editing
        const firstType = res.data.types[0];
        if (!event && firstType) {
          setEventType(firstType.id);
        }
      }
    });
  }, [event]);

  const isEdit = !!event;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !eventType) return;
    onSubmit({ name: name.trim(), eventType });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-3">
      <div>
        <h3 className="text-[13px] font-semibold text-vscode-text">{isEdit ? 'Edit event' : 'New event'}</h3>
      </div>
      <Input label="Event name" value={name} onChange={setName} placeholder="Example: BR60S Qualification" required />
      <div className="flex flex-col gap-1">
        <label htmlFor="event-type" className="text-[13px] font-medium text-vscode-text-muted">
          Type
        </label>
        <select
          id="event-type"
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          className="min-h-9 rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 py-1.5 text-[13px] text-vscode-text"
        >
          {competitionTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2 border-t border-vscode-border pt-3">
        <Button type="submit" size="sm" disabled={!name.trim() || !eventType}>
          {isEdit ? 'Save' : 'Add'}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
