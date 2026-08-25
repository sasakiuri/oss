import { useState } from 'react';
import { Button } from '../../shared/common/Button';
import { DateInput } from '../../shared/common/DateInput';
import { Input } from '../../shared/common/Input';
import type { ChampionshipDto } from '@/shared/ipc/contracts/championship.contract';

interface ChampionshipFormProps {
  championship?: ChampionshipDto | null;
  onSubmit: (data: { name: string; date: string; venue: string }) => void;
  onCancel: () => void;
}

export function ChampionshipForm({ championship, onSubmit, onCancel }: ChampionshipFormProps) {
  const [name, setName] = useState(championship?.name ?? '');
  const [date, setDate] = useState(championship?.date ?? '');
  const [venue, setVenue] = useState(championship?.venue ?? '');
  const canSubmit = name.trim() !== '' && date !== '' && venue.trim() !== '';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ name: name.trim(), date, venue: venue.trim() });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Championship name"
        value={name}
        onChange={setName}
        placeholder="Example: City Rifle Championship"
        required
      />
      <DateInput label="Date" value={date} onChange={setDate} required />
      <Input label="Venue" value={venue} onChange={setVenue} placeholder="Example: Municipal Shooting Range" required />
      <div className="flex gap-2 border-t border-vscode-border pt-3">
        <Button type="submit" disabled={!canSubmit}>
          {championship ? 'Update' : 'Create'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
