import { GripVertical, Trash2 } from 'lucide-react';
import { useIMEInput } from '@/renderer/presentation/hooks/useIMEInput';

interface ParticipantRow {
  id?: string;
  tempId: string;
  playerName: string;
  familyName: string;
  affiliation: string;
  startNumber: string;
  issfId: string;
  nationCode: string;
  gender: 'M' | 'F' | 'X' | 'UNSPECIFIED';
  entryStatus: 'COMPETING' | 'RPO' | 'MQS' | 'OOC' | 'DNS' | 'DNF' | 'DSQ' | 'DQB';
  teamId: string;
  teamName: string;
}

interface ParticipantRowProps {
  row: ParticipantRow;
  index: number;
  isDragging: boolean;
  isDragOver: boolean;
  onUpdate: (index: number, field: keyof ParticipantRow, value: string) => void;
  onRemove: (index: number) => void;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (index: number) => void;
  onDragEnd: () => void;
}

export function ParticipantRow({
  row,
  index,
  isDragging,
  isDragOver,
  onUpdate,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: ParticipantRowProps) {
  const playerNameIME = useIMEInput(row.playerName, (value) => onUpdate(index, 'playerName', value));

  const familyNameIME = useIMEInput(row.familyName, (value) => onUpdate(index, 'familyName', value));

  const affiliationIME = useIMEInput(row.affiliation, (value) => onUpdate(index, 'affiliation', value));

  return (
    <tr
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={() => onDrop(index)}
      className={`border-b border-vscode-border/50 ${isDragging ? 'opacity-30' : ''} ${isDragOver ? 'border-t-2 border-t-vscode-primary' : ''}`}
    >
      <td className="w-6 px-1 py-1">
        <span
          draggable
          onDragStart={() => onDragStart(index)}
          onDragEnd={onDragEnd}
          className="cursor-grab text-vscode-dimmed hover:text-vscode-text active:cursor-grabbing"
        >
          <GripVertical size={12} />
        </span>
      </td>
      <td className="px-1 py-1">
        <input
          type="text"
          value={familyNameIME.value}
          onChange={familyNameIME.onChange}
          onCompositionStart={familyNameIME.onCompositionStart}
          onCompositionEnd={familyNameIME.onCompositionEnd}
          placeholder="Family name"
          className="min-h-8 w-full rounded-[3px] border border-vscode-border bg-vscode-input px-2 py-1 text-[13px] text-vscode-text placeholder:text-vscode-dimmed"
          lang="en"
        />
      </td>
      <td className="px-1 py-1">
        <input
          type="text"
          value={playerNameIME.value}
          onChange={playerNameIME.onChange}
          onCompositionStart={playerNameIME.onCompositionStart}
          onCompositionEnd={playerNameIME.onCompositionEnd}
          placeholder="Athlete name"
          className="min-h-8 w-full rounded-[3px] border border-vscode-border bg-vscode-input px-2 py-1 text-[13px] text-vscode-text placeholder:text-vscode-dimmed"
          lang="en"
        />
      </td>
      <CompactInput
        value={row.startNumber}
        placeholder="Start #"
        onChange={(value) => onUpdate(index, 'startNumber', value)}
      />
      <CompactInput value={row.issfId} placeholder="ISSF ID" onChange={(value) => onUpdate(index, 'issfId', value)} />
      <CompactInput
        value={row.nationCode}
        placeholder="NOC"
        maxLength={3}
        onChange={(value) => onUpdate(index, 'nationCode', value.toUpperCase())}
      />
      <td className="px-1 py-1">
        <select
          aria-label="Gender"
          value={row.gender}
          onChange={(event) => onUpdate(index, 'gender', event.target.value)}
          className={compactClass}
        >
          <option value="UNSPECIFIED">—</option>
          <option value="M">M</option>
          <option value="F">F</option>
          <option value="X">X</option>
        </select>
      </td>
      <td className="px-1 py-1">
        <select
          aria-label="Entry status"
          value={row.entryStatus}
          onChange={(event) => onUpdate(index, 'entryStatus', event.target.value)}
          className={compactClass}
        >
          {['COMPETING', 'RPO', 'MQS', 'OOC', 'DNS', 'DNF', 'DSQ', 'DQB'].map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </td>
      <CompactInput value={row.teamId} placeholder="Team ID" onChange={(value) => onUpdate(index, 'teamId', value)} />
      <CompactInput
        value={row.teamName}
        placeholder="Team name"
        onChange={(value) => onUpdate(index, 'teamName', value)}
      />
      <td className="px-1 py-1">
        <input
          type="text"
          value={affiliationIME.value}
          onChange={affiliationIME.onChange}
          onCompositionStart={affiliationIME.onCompositionStart}
          onCompositionEnd={affiliationIME.onCompositionEnd}
          placeholder="Affiliation"
          className="min-h-8 w-full rounded-[3px] border border-vscode-border bg-vscode-input px-2 py-1 text-[13px] text-vscode-text placeholder:text-vscode-dimmed"
          lang="en"
        />
      </td>
      <td className="px-1 py-1">
        <button
          type="button"
          aria-label={`Delete ${row.playerName || 'unnamed participant'}`}
          onClick={() => onRemove(index)}
          className="p-1 text-vscode-dimmed transition-colors hover:text-vscode-error"
        >
          <Trash2 size={12} aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
}

function CompactInput({
  value,
  placeholder,
  maxLength,
  onChange,
}: {
  value: string;
  placeholder: string;
  maxLength?: number;
  onChange: (value: string) => void;
}) {
  return (
    <td className="px-1 py-1">
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        className={compactClass}
        lang="en"
      />
    </td>
  );
}

const compactClass =
  'min-h-8 min-w-20 rounded-[3px] border border-vscode-border bg-vscode-input px-2 py-1 text-[12px] text-vscode-text placeholder:text-vscode-dimmed';
